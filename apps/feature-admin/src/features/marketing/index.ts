/**
 * Marketing Feature - Client
 */

// Routes
export {
  createMarketingRoutes,
  createMarketingAdminRoutes,
  MARKETING_PATH,
  MARKETING_ADMIN_PATH,
} from "./routes";

// Widget components
export { SocialPublishButton } from "./components/social-publish-button";
export { SocialContentSheet } from "./components/social-content-sheet";

// Widget hooks
export { useSocialPublish } from "./hooks/use-social-publish";
