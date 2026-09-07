// backend/services/priceClustering.js
//
// AI/ML Price Auto Cluster — real K-Means Clustering, written in Pure
// JavaScript (no ML library added to package.json). Groups the shop's
// active drink products into 3 price tiers — Budget / Standard / Premium —
// based purely on `Inventory.price`.
//
// This is intentionally a *service*, not a route: it has no knowledge of
// Express, MySQL, or HTTP. It only knows how to turn a list of prices into
// cluster assignments. `products.routes.js` is the only caller — it fetches
// the current active prices from the database and passes them in here on
// every GET /api/products / GET /api/products/:id request (no caching, no
// new column, nothing persisted — clusters are recomputed fresh every time
// from whatever is in Inventory right now).
//
// ---------------------------------------------------------------------------
// How the algorithm works (K-Means / Lloyd's algorithm, 1-dimensional):
//
// 1. INPUT: a flat array of numbers — the `price` of every currently active
//    product (Inventory.is_active = 1). Price is the ONLY feature used.
//
// 2. INITIAL CENTROIDS: instead of picking 3 random starting points (which
//    would make the result different every time you refresh the page — bad
//    for a demo and bad for consistency), we deterministically spread K
//    initial centroids evenly across the observed [min price, max price]
//    range. For K = 3 that's exactly: min, the midpoint, and max. This is a
//    standard, legitimate K-Means initialization strategy (deterministic /
//    linear initialization) — it is NOT a hardcoded business rule about what
//    "cheap" or "expensive" means; it is only a *starting guess* that the
//    algorithm then corrects using the real data.
//
// 3. ASSIGNMENT STEP: every price is assigned to whichever of the current
//    centroids it is numerically closest to (smallest absolute difference).
//
// 4. UPDATE STEP: each centroid is recomputed as the mean (average) price of
//    every point currently assigned to it. This moves each centroid toward
//    the middle of its own group.
//
// 5. REPEAT: steps 3–4 repeat until either (a) no product changes which
//    cluster it belongs to AND the centroids barely move any more (below a
//    tiny tolerance), which means the algorithm has converged, or (b) a
//    safety cap of iterations is hit (100 — real 1-D price data converges in
//    just a handful of iterations in practice, so this cap is just a
//    guardrail against an infinite loop, never actually the reason it stops).
//
// 6. NAMING THE CLUSTERS: K-Means itself has no idea what "Budget" or
//    "Premium" means — it only outputs 3 centroid numbers and an assignment
//    for each product. We rank the 3 final centroids from lowest price to
//    highest price and map them, in that order, to Budget → Standard →
//    Premium. Because centroids are sorted purely by their own numeric value
//    (not by index or insertion order), the cluster with the lowest average
//    price is always Budget, the middle one is always Standard, and the
//    highest is always Premium — regardless of which starting centroid it
//    grew from.
// ---------------------------------------------------------------------------

const DEFAULT_K = 3;
const MAX_ITERATIONS = 100;
const TOLERANCE = 1e-6;

// Cluster name assigned by *rank* (0 = lowest price ... last = highest
// price), not by cluster index. Falls back gracefully if there isn't enough
// distinct price data to form all 3 clusters (e.g. a brand-new shop with
// only 1 or 2 products / distinct prices).
const TIER_NAMES_BY_K = {
  1: ['Standard'],
  2: ['Budget', 'Premium'],
  3: ['Budget', 'Standard', 'Premium'],
};

/**
 * Plain 1-D K-Means (Lloyd's algorithm), pure JavaScript, no dependencies.
 *
 * @param {number[]} values - the data points to cluster (here: prices).
 * @param {number} k - desired number of clusters.
 * @returns {{ centroids: number[], assignments: number[] }}
 *   centroids[i] is the final mean of cluster i.
 *   assignments[j] is the cluster index (into `centroids`) that values[j] belongs to.
 */
function kmeans1D(values, k = DEFAULT_K) {
  const n = values.length;
  if (n === 0) return { centroids: [], assignments: [] };

  // Can't form more clusters than there are distinct price points.
  const distinctPrices = [...new Set(values)].sort((a, b) => a - b);
  const effectiveK = Math.min(k, distinctPrices.length);

  // --- Step 2: deterministic initial centroids, evenly spread across the
  // real observed price range (not random, not hardcoded price thresholds).
  let centroids;
  if (effectiveK === 1) {
    centroids = [values.reduce((sum, v) => sum + v, 0) / n];
  } else {
    const min = distinctPrices[0];
    const max = distinctPrices[distinctPrices.length - 1];
    centroids = Array.from(
      { length: effectiveK },
      (_, i) => min + (i * (max - min)) / (effectiveK - 1)
    );
  }

  let assignments = new Array(n).fill(0);

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // --- Step 3: assignment — each price joins its nearest centroid.
    const newAssignments = values.map((price) => {
      let bestCluster = 0;
      let bestDistance = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const distance = Math.abs(price - centroids[c]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestCluster = c;
        }
      }
      return bestCluster;
    });

    const anyAssignmentChanged = newAssignments.some((cluster, idx) => cluster !== assignments[idx]);
    assignments = newAssignments;

    // --- Step 4: update — each centroid becomes the mean price of its group.
    const sums = new Array(centroids.length).fill(0);
    const counts = new Array(centroids.length).fill(0);
    values.forEach((price, idx) => {
      sums[assignments[idx]] += price;
      counts[assignments[idx]] += 1;
    });
    const newCentroids = centroids.map((oldCentroid, c) =>
      counts[c] > 0 ? sums[c] / counts[c] : oldCentroid // empty cluster keeps its old centroid
    );

    const maxShift = Math.max(...newCentroids.map((c, idx) => Math.abs(c - centroids[idx])));
    centroids = newCentroids;

    // --- Step 5: stop once assignments are stable and centroids stopped moving.
    if (!anyAssignmentChanged && maxShift < TOLERANCE) break;
  }

  return { centroids, assignments };
}

// ===== AI/ML Price Auto Cluster (entry point) =====
/**
 * Runs K-Means over the given products' prices and returns a Map of
 * productId -> tier name ('Budget' | 'Standard' | 'Premium').
 *
 * @param {{ id: number, price: number }[]} products - active products only.
 * @returns {Map<number, string>}
 */
function computePriceTiers(products) {
  const tierByProductId = new Map();

  // mysql2 returns DECIMAL columns (like Inventory.price) as STRINGS
  // (e.g. "60.00"), not JS numbers — so every price is coerced with
  // Number(...) here before anything else touches it. Skipping this and
  // checking `typeof price === 'number'` directly would silently reject
  // every real row and make priceTier come back null for the whole shop.
  const withValidPrice = products
    .map((p) => ({ id: p.id, price: Number(p.price) }))
    .filter((p) => Number.isFinite(p.price));
  if (withValidPrice.length === 0) return tierByProductId;

  const prices = withValidPrice.map((p) => p.price);
  const { centroids, assignments } = kmeans1D(prices, DEFAULT_K);

  // --- Step 6: rank centroids by price (low -> high) and name them.
  const rankedClusterIndexes = centroids
    .map((centroidPrice, clusterIndex) => ({ centroidPrice, clusterIndex }))
    .sort((a, b) => a.centroidPrice - b.centroidPrice);

  const tierNames = TIER_NAMES_BY_K[centroids.length] || TIER_NAMES_BY_K[3];
  const clusterIndexToTierName = {};
  rankedClusterIndexes.forEach(({ clusterIndex }, rank) => {
    clusterIndexToTierName[clusterIndex] = tierNames[rank];
  });

  withValidPrice.forEach((product, i) => {
    const clusterIndex = assignments[i];
    tierByProductId.set(product.id, clusterIndexToTierName[clusterIndex]);
  });

  return tierByProductId;
}

module.exports = { kmeans1D, computePriceTiers };
