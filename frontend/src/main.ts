import { bootstrapApplication } from '@angular/platform-browser';
import { enableRipple, registerLicense } from '@syncfusion/ej2-base';
import { App } from './app/app';
import { buildAppConfig } from './app/app.config';
import { loadAppConfig } from './app/core/config';
import { setupThaiLocale } from './app/core/locale';

loadAppConfig().then((config) => {
  if (config.syncfusionLicense) {
    registerLicense(config.syncfusionLicense);
  }
  setupThaiLocale();
  enableRipple(true);
  return bootstrapApplication(App, buildAppConfig(config)).catch((err) => console.error(err));
});
