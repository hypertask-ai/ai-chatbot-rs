import * as Cloudflare from "@alchemy.run/cloudflare";

export class Website extends Cloudflare.Website.Foldkit<Website>()("Website", {
  assets: {
    headers:
      "/widget/widget.js\n  Content-Type: application/javascript\n  Cache-Control: public, max-age=3600\n",
  },
  rootDir: "../web",
}) {}
