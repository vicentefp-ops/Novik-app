import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/pubmed", async (req, res) => {
    const { query, verifyOnly } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    try {
      const apiKey = process.env.PUBMED_API_KEY;
      const apiKeyParam = apiKey ? `&api_key=${apiKey}` : '';

      let dateParams = '';
      if (!verifyOnly) {
        // PubMed E-utilities API - Restrict to last 10 years (2016-2026)
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - 10;
        dateParams = `&mindate=${startYear}&maxdate=${currentYear}&datetype=pdat`;
      }

      const fetchWithRetry = async (url: string, retries = 3, delay = 1000) => {
        for (let i = 0; i < retries; i++) {
          // Add a small delay to respect PubMed rate limits (3 requests per second without API key)
          if (!apiKey) {
            await new Promise(resolve => setTimeout(resolve, 350));
          }
          
          const response = await fetch(url);
          if (response.ok) {
            return response;
          }
          if (response.status === 429) {
            console.warn(`Rate limited by PubMed. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
            continue;
          }
          throw new Error(`PubMed API error: ${response.status} ${response.statusText}`);
        }
        throw new Error('Max retries reached for PubMed API');
      };

      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}${dateParams}&retmax=5&retmode=json${apiKeyParam}`;
      const searchResponse = await fetchWithRetry(searchUrl);
      const searchData = await searchResponse.json();
      const idList = searchData.esearchresult?.idlist || [];

      if (idList.length === 0) {
        return res.json({ results: [] });
      }

      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${idList.join(',')}&retmode=json${apiKeyParam}`;
      const fetchResponse = await fetchWithRetry(fetchUrl);
      const fetchData = await fetchResponse.json();

      const results = idList.map((id: string) => {
        const item = fetchData.result[id];
        const doiObj = item.articleids?.find((a: any) => a.idtype === 'doi');
        return {
          title: item.title,
          authors: item.authors ? item.authors.map((a: any) => a.name).join(', ') : '',
          source: item.source,
          pubdate: item.pubdate,
          doi: doiObj ? doiObj.value : undefined,
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
        };
      });

      res.json({ results });
    } catch (error) {
      console.error("PubMed API error:", error);
      res.status(500).json({ error: "Failed to fetch from PubMed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
