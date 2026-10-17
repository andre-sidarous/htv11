import { Image, type ImageStyle, type StyleProp } from "react-native";
import { PICO, PICO_ASPECT, type PicoMood } from "./brandAssets";

/**
 * Pico, the Huddle penguin. Decorative by default (hidden from screen readers); pass
 * `accessibilityLabel` only where the mascot itself carries meaning.
 */
export function Pico({
  mood = "default",
  size = 96,
  style,
  accessibilityLabel,
}: {
  mood?: PicoMood;
  /** Height in points. */
  size?: number;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  const label = accessibilityLabel;
  return (
    <Image
      source={PICO[mood]}
      resizeMode="contain"
      style={[{ height: size, width: size * PICO_ASPECT }, style]}
      accessible={Boolean(label)}
      accessibilityRole={label ? "image" : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
    />
  );
}
