export default function Loading() {
  // Every concrete admin route owns its matching loading composition. Keep
  // the parent boundary empty so a generic admin skeleton cannot flash before
  // the route-specific one (and cannot appear for an eventual empty state).
  return null;
}
