// src/app/explore.tsx
// This screen used to render hard-coded mock products fetched from a GitHub
// JSON file — real Inventory data now lives on the Products tab instead, so
// this route just forwards there. Kept (rather than deleted) so any existing
// bookmark/link to /explore still lands somewhere useful instead of 404ing.
import { Redirect } from 'expo-router';

export default function ExploreRedirect() {
  return <Redirect href="/products" />;
}
