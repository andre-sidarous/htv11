import { Image, type ImageStyle, type StyleProp } from "react-native";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { LOGO_SLOGAN, LOGO_SLOGAN_ASPECT, LOGO_WORDMARK, LOGO_WORDMARK_ASPECT } from "./brandAssets";

/**
 * The Huddle logo artwork. `wordmark` is the name alone (tab headers, the Home header);
 * `slogan` adds "N' Waddle" underneath (Welcome, splash). The wordmark already contains a
 * penguin, so don't place a separate Pico right next to it.
 */
export function HuddleLogo({
  variant = "wordmark",
  height = 32,
  style,
}: {
  variant?: "wordmark" | "slogan";
  /** Height in points; width follows the artwork's aspect ratio. */
  height?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const slogan = variant === "slogan";
  return (
    <Image
      source={slogan ? LOGO_SLOGAN : LOGO_WORDMARK}
      resizeMode="contain"
      style={[{ height, width: height * (slogan ? LOGO_SLOGAN_ASPECT : LOGO_WORDMARK_ASPECT) }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={slogan ? `${APP_NAME}. ${APP_TAGLINE}` : APP_NAME}
    />
  );
}
