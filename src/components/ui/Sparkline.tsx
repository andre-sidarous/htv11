import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
import { colors } from "@/theme";

/**
 * A small line chart (e.g. heart rate over the last minutes). Width follows the parent.
 * `reference` draws a dashed horizontal line (e.g. the personal baseline). Decorative: give the
 * surrounding view an accessibilityLabel that states the numbers.
 */
export function Sparkline({
  values,
  height = 96,
  color = colors.brand,
  reference,
}: {
  values: number[];
  height?: number;
  color?: string;
  reference?: number;
}) {
  const [width, setWidth] = useState(0);
  const pad = 6;
  const all = reference != null ? [...values, reference] : values;
  const min = Math.min(...all) - 5;
  const max = Math.max(...all) + 5;
  const x = (i: number) => pad + (values.length <= 1 ? 0 : (i / (values.length - 1)) * (width - pad * 2));
  const y = (v: number) => pad + (1 - (v - min) / Math.max(1, max - min)) * (height - pad * 2);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = values.length > 1 ? `${line} L${x(values.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z` : "";
  const last = values[values.length - 1];

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {width > 0 && values.length > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.18} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {reference != null ? (
            <Line x1={pad} x2={width - pad} y1={y(reference)} y2={y(reference)} stroke={colors.inkFaint} strokeWidth={1} strokeDasharray="4 4" />
          ) : null}
          {area ? <Path d={area} fill="url(#spark)" /> : null}
          <Path d={line} stroke={color} strokeWidth={2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {last != null ? <Circle cx={x(values.length - 1)} cy={y(last)} r={4} fill={colors.surface} stroke={color} strokeWidth={2.25} /> : null}
        </Svg>
      ) : null}
    </View>
  );
}
