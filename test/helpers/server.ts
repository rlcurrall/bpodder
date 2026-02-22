export function getServerUrl(): string {
  const url = process.env.TEST_URL;
  if (!url) {
    throw new Error(
      "TEST_URL environment variable is required. Start the server and set TEST_URL=http://localhost:PORT"
    );
  }
  return url;
}
