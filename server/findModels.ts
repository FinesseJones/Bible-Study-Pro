async function find() {
  const r = await fetch("https://openrouter.ai/api/v1/models");
  const d = await r.json();
  const freeModels = d.data.filter((m: any) => m.pricing.prompt === "0" && m.pricing.completion === "0").map((m: any) => m.id);
  console.log("FREE MODELS:", freeModels.join(", "));
}
find();
