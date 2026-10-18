"""
Train Huddle's health-risk model on NHANES (CDC National Health and Nutrition Examination Survey).

  python ml/train_health_model.py <cache-dir-outside-repo>

What it does:
  1. Downloads six public NHANES 2017-March 2020 files (no login) into <cache-dir>.
  2. Cleans them to adults (18+) with a measured resting pulse.
  3. Builds normal resting heart-rate ranges by age group and sex (10th / 50th / 90th percentile and
     the most common value). The app uses these to start your simulated heartbeat and to decide what
     counts as "high for your age".
  4. Trains a logistic regression that predicts whether someone has HIGH BLOOD PRESSURE, DIABETES or
     HEART DISEASE (any of them, as told by a doctor) from age, sex, BMI, resting heart rate and
     family history. Evaluated on 25% held-out people (AUC, accuracy).
  5. Writes src/features/health/data/health-model.json (coefficients in plain units, so the phone
     can compute the prediction with no server).

Not a diagnosis: it's a risk estimate from population data. Survey weights are not applied
(a simplification for the prototype).
"""

import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import train_test_split

BASE = "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2017/DataFiles"
FILES = ["P_DEMO", "P_BMX", "P_BPXO", "P_BPQ", "P_DIQ", "P_MCQ"]
OUT = Path(__file__).resolve().parent.parent / "src" / "features" / "health" / "data" / "health-model.json"

AGE_BANDS = [(18, 29), (30, 39), (40, 49), (50, 59), (60, 69), (70, 80)]
FEATURES = ["age", "male", "bmi", "resting_hr", "family_heart", "family_diabetes"]


def load(cache: Path, name: str) -> pd.DataFrame:
    path = cache / f"{name}.xpt"
    if not path.exists():
        print(f"downloading {name}...")
        urllib.request.urlretrieve(f"{BASE}/{name}.xpt", path)
    return pd.read_sas(path, format="xport").set_index("SEQN")


def yes(series: pd.Series) -> pd.Series:
    """NHANES yes/no: 1 = yes, 2 = no, 7/9 = refused / don't know (treated as missing)."""
    return series.map({1.0: 1.0, 2.0: 0.0})


def build(cache: Path) -> pd.DataFrame:
    demo, bmx, bpxo, bpq, diq, mcq = (load(cache, f) for f in FILES)
    df = pd.DataFrame(index=demo.index)
    df["age"] = demo["RIDAGEYR"]  # top-coded at 80
    df["male"] = (demo["RIAGENDR"] == 1).astype(float)
    df["bmi"] = bmx["BMXBMI"]
    df["resting_hr"] = bpxo[["BPXOPLS1", "BPXOPLS2", "BPXOPLS3"]].mean(axis=1)
    df["family_heart"] = yes(mcq["MCQ300A"])  # close relative had a heart attack or angina
    df["family_diabetes"] = yes(mcq["MCQ300C"])  # close relative had diabetes

    high_bp = yes(bpq["BPQ020"])  # ever told you had high blood pressure
    diabetes = diq["DIQ010"].map({1.0: 1.0, 2.0: 0.0, 3.0: 0.0})  # 3 = borderline, counted as no
    heart = pd.concat([yes(mcq[c]) for c in ["MCQ160B", "MCQ160C", "MCQ160D", "MCQ160E"]], axis=1).max(axis=1)
    df["has_condition"] = pd.concat([high_bp, diabetes, heart], axis=1).max(axis=1)
    df["high_bp"], df["diabetes"], df["heart_disease"] = high_bp, diabetes, heart

    df = df[df["age"] >= 18]
    # Drop implausible pulses (measurement errors) and anything missing.
    df = df[(df["resting_hr"] >= 35) & (df["resting_hr"] <= 160)]
    return df.dropna(subset=FEATURES + ["has_condition"])


def band_of(age: float) -> str:
    for lo, hi in AGE_BANDS:
        if lo <= age <= hi:
            return f"{lo}-{hi}"
    return f"{AGE_BANDS[-1][0]}-{AGE_BANDS[-1][1]}"


def pulse_norms(df: pd.DataFrame) -> list[dict]:
    rows = []
    for lo, hi in AGE_BANDS:
        for sex, male in (("female", 0.0), ("male", 1.0)):
            hr = df[(df["age"] >= lo) & (df["age"] <= hi) & (df["male"] == male)]["resting_hr"]
            rounded = hr.round()
            rows.append(
                {
                    "ageMin": lo,
                    "ageMax": hi,
                    "sex": sex,
                    "n": int(len(hr)),
                    "p10": round(float(hr.quantile(0.10))),
                    "p50": round(float(hr.quantile(0.50))),
                    "p90": round(float(hr.quantile(0.90))),
                    "mostCommon": int(rounded.mode().iloc[0]),
                }
            )
    return rows


def main(cache_dir: str) -> None:
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    df = build(cache)
    print(f"{len(df)} adults with complete data; {df['has_condition'].mean():.1%} have high blood pressure, diabetes or heart disease")

    X, y = df[FEATURES].to_numpy(), df["has_condition"].to_numpy()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=42, stratify=y)
    mean, std = X_train.mean(axis=0), X_train.std(axis=0)
    model = LogisticRegression(max_iter=1000).fit((X_train - mean) / std, y_train)
    p_test = model.predict_proba((X_test - mean) / std)[:, 1]
    auc = roc_auc_score(y_test, p_test)
    acc = accuracy_score(y_test, p_test >= 0.5)
    print(f"held-out AUC {auc:.3f}, accuracy {acc:.1%} (n={len(y_test)})")

    # Back to plain units so the app computes: logit = intercept + sum(coef[f] * value[f]).
    coef = model.coef_[0] / std
    intercept = float(model.intercept_[0] - np.sum(model.coef_[0] * mean / std))
    for name, c in zip(FEATURES, coef):
        print(f"  {name:16s} {c:+.4f}  (odds x{np.exp(c):.3f} per unit)")

    # "Compared to people your age": how common the conditions are per age group and sex.
    df["band"] = df["age"].map(band_of)
    prevalence = [
        {"ageMin": lo, "ageMax": hi, "sex": sex, "rate": round(float(g["has_condition"].mean()), 3)}
        for lo, hi in AGE_BANDS
        for sex, male in (("female", 0.0), ("male", 1.0))
        for g in [df[(df["band"] == f"{lo}-{hi}") & (df["male"] == male)]]
    ]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "source": "NHANES 2017-March 2020 pre-pandemic (CDC), adults 18+",
                "trainedOn": date.today().isoformat(),
                "predicts": "high blood pressure, diabetes or heart disease (told by a doctor)",
                "features": FEATURES,
                "intercept": round(intercept, 6),
                "coefficients": {name: round(float(c), 6) for name, c in zip(FEATURES, coef)},
                "metrics": {"auc": round(float(auc), 3), "accuracy": round(float(acc), 3), "testSize": int(len(y_test)), "trainSize": int(len(y_train))},
                "baseRate": round(float(y.mean()), 3),
                "prevalenceByAgeSex": prevalence,
                "restingHeartRate": pulse_norms(df),
            },
            indent=2,
        )
        + "\n"
    )
    print(f"wrote {OUT}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python ml/train_health_model.py <cache-dir-outside-repo>")
    main(sys.argv[1])
