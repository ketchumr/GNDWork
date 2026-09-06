export default {
  providers: [
    {
      // Convex Auth issues its own tokens for this deployment.
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
