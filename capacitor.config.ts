import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.braidr.app',
  appName: 'Braidr',
  webDir: 'dist',
  server: {
    iosScheme: 'capacitor',
    androidScheme: 'https',
  },
  ios: {
    allowsLinkPreview: false,
  },
};

export default config;
