function matchAllRegex(regex: RegExp, str: string): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  const globalRegex = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  while ((match = globalRegex.exec(str)) !== null) {
    matches.push(match);
  }
  return matches;
}

export async function searchWeb(query: string): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    if (!response.ok) {
      return `Failed to fetch search results: ${response.statusText}`;
    }
    const html = await response.text();
    
    // Simple robust regex parsing for DuckDuckGo HTML results
    const matches = matchAllRegex(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi, html);
    const titleMatches = matchAllRegex(/<a class="result__link"[^>]*>([\s\S]*?)<\/a>/gi, html);
    const urlMatches = matchAllRegex(/<a class="result__url"[^>]*>([\s\S]*?)<\/a>/gi, html);
    
    if (matches.length === 0) {
      return "No web results found.";
    }
    
    const results: string[] = [];
    for (let i = 0; i < Math.min(matches.length, 5); i++) {
      const snippet = matches[i][1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const title = titleMatches[i] ? titleMatches[i][1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "Result";
      const link = urlMatches[i] ? urlMatches[i][1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
      results.push(`[Result ${i+1}]\nTitle: ${title}\nURL: https://${link}\nSummary: ${snippet}`);
    }
    return results.join("\n\n");
  } catch (err) {
    return `Search failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
