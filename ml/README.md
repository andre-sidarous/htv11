# Health model (NHANES)

Huddle's health estimate is trained on **NHANES 2017–March 2020**, the CDC's national health survey
(public data, no login). [`train_health_model.py`](train_health_model.py) downloads it, cleans it, and
writes [`src/features/health/data/health-model.json`](../src/features/health/data/health-model.json),
which the app reads. Predictions run on the phone; nothing is sent to a server.

## What it predicts

The chance someone has **high blood pressure, diabetes or heart disease** (told by a doctor), from:

| Input | Effect on the odds |
|---|---|
| Family history of diabetes | × 1.85 |
| Family history of heart disease | × 1.65 |
| Male | × 1.37 |
| Each year of age | × 1.07 |
| Each BMI point | × 1.06 |
| Each extra resting beat per minute | × 1.018 (≈ × 1.2 per 10 bpm) |

**6,712 adults**, logistic regression, tested on 25% held-out people: **AUC 0.81, 73% accuracy**.
Shown as an estimate, never a diagnosis.

## Normal resting heart rate

The same data gives the normal resting heart rate (10th–90th percentile) and the most common value for
each age group and sex. Sign-up uses it to start the simulated heartbeat at what's typical for you, and
"high for your age" means above that range.

## Re-run

```bash
python -m venv .venv && .venv/Scripts/pip install pandas scikit-learn   # macOS/Linux: .venv/bin/pip
.venv/Scripts/python ml/train_health_model.py <cache-dir-outside-repo>
```

Simplifications for the prototype: NHANES survey weights aren't applied, and "borderline" diabetes
counts as no.
