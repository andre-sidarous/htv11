import { defaultAppSettings, type AppSettings } from '@htv11/types';

export const getAppSettings = (): AppSettings => ({
  ...defaultAppSettings,
  appName: defaultAppSettings.appName
});
