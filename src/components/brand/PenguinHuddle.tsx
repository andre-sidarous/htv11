import { Image, type ImageStyle, type StyleProp } from "react-native";
import { PENGUIN_HUDDLE, PENGUIN_HUDDLE_ASPECT } from "./brandAssets";

/** Three penguins huddled together. Decorative: the screen's own text carries the meaning. */
export function PenguinHuddle({ height = 180, style }: { height?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={PENGUIN_HUDDLE}
      resizeMode="contain"
      style={[{ height, width: height * PENGUIN_HUDDLE_ASPECT, alignSelf: "center" }, style]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
