export const SITE = {
  name: "Toronto Coffee Guide",
  tagline: "Discover Toronto's Coffee Scene.",
  description:
    "Find your next favourite coffee shop. Explore independent cafes, specialty coffee, matcha bars, and hidden gems across Toronto.",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
};

export const QUICK_SEARCHES = [
  "Matcha",
  "Vietnamese Coffee",
  "Specialty Coffee",
  "Japanese Cafes",
  "Bakeries",
  "Cold Brew",
  "Brunch",
  "Pastries",
];
