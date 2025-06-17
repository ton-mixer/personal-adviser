// Import jest-dom extensions
import "@testing-library/jest-dom";

// Mock next/image
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...props} alt={props.alt || ""} />;
  },
}));

// Mock environment variables if needed
process.env.NEXTAUTH_SECRET = "test-secret";
process.env.GOOGLE_APPLICATION_CREDENTIALS = "./google-cloud-credentials.json";
