/**
 * ShowMeAnImage — shared config
 *
 * Set your Cloudflare Worker URL here. All category pages read from this file
 * so you only need to update it in one place.
 *
 * Find your Worker URL in the Cloudflare dashboard under Workers & Pages
 * → your worker → the URL shown at the top (ends in .workers.dev)
 */
const SMAI_CONFIG = {
  workerUrl: "https://portfolio-wall-upload.showmeanimage.workers.dev",
};
