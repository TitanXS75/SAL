/**
 * SAL Agent - Website Downloader Module
 * Uses the exact same wget-based downloading and post-processing code from Website-downloader.
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Locate wget.exe
const binWgetPath = path.join(__dirname, '../bin/wget.exe');
const externalWgetPath = 'D:\\Projects\\Website-downloader\\wget\\wget.exe';
const wgetCmd = fs.existsSync(binWgetPath) ? binWgetPath : externalWgetPath;

/**
 * Derives website folder name from URL (exact implementation from Website-downloader)
 */
function getWebsiteFolderName(websiteUrl) {
  try {
    const normalizedUrl = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `http://${websiteUrl}`;
    const parsedUrl = new URL(normalizedUrl);
    return parsedUrl.port ? `${parsedUrl.hostname}:${parsedUrl.port}` : parsedUrl.hostname;
  } catch (error) {
    return "";
  }
}

/**
 * Fixes percent-encoded Next.js image paths in downloaded HTML files
 * (Exact implementation from Website-downloader/wget/index.js)
 */
function fixDownloadedImagePaths(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      fixDownloadedImagePaths(fullPath);
    } else if (file.isFile() && (file.name.endsWith('.html') || file.name.endsWith('.htm'))) {
      try {
        let content = fs.readFileSync(fullPath, 'utf8');

        // Replace %252F with / and %2526 with & in image URLs & srcset strings
        let updatedContent = content
          .replace(/_next\/image\?url=%252F([^"'\s>]+)/g, (match, p1) => {
            const decoded = decodeURIComponent('%2F' + p1);
            return decoded;
          })
          .replace(/%252F/g, '/')
          .replace(/%2526/g, '&');

        // Restore Google Maps iframe embeds to online endpoint to avoid localhost referer crashes
        updatedContent = updatedContent.replace(
          /(<iframe[^>]*\ssrc=["'])(?:\.\.\/)*www\.google\.com\/maps@([^"'>]+?)(?:\.html)?(["'][^>]*>)/gi,
          (m, p1, query, p3) => {
            const cleanQuery = query.replace(/&amp;/g, '&');
            return `${p1}https://www.google.com/maps?${cleanQuery}${p3}`;
          }
        );

        if (content !== updatedContent) {
          fs.writeFileSync(fullPath, updatedContent, 'utf8');
        }
      } catch (err) {
        console.error("Error fixing paths in:", fullPath, err);
      }
    }
  }
}

/**
 * Extract clean hostname from URL
 */
function extractHostname(url) {
  try {
    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `http://${url}`;
    const parsed = new URL(normalizedUrl);
    return parsed.hostname;
  } catch (e) {
    return '';
  }
}

/**
 * Download a website using wget with domain isolation and live progress streaming
 * @param {string} websiteUrl - Target URL
 * @param {string} projectDir - Destination folder
 * @param {function} onLog - Callback for progress messages
 * @param {object} options - { mode: 'simple'|'crawl', downloadFonts: boolean, timeoutMs: number }
 * @returns {Promise<{ websiteFolder: string, entryFile: string, totalFiles: number }>}
 */
function download(websiteUrl, projectDir, onLog = () => {}, options = {}) {
  return new Promise((resolve, reject) => {
    let website = "";
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    const hostname = extractHostname(websiteUrl);
    const mode = options.mode || 'simple'; // 'simple' (page + requisites) or 'crawl' (depth-2 internal site crawler)
    const downloadFonts = Boolean(options.downloadFonts); // default false: skip heavy binary fonts, load from CDN
    const timeoutMs = options.timeoutMs || 150000; // 2.5 min max safety timeout

    // Reject font binaries if downloadFonts is false to save time & bandwidth
    const rejectFlag = !downloadFonts ? '--reject="woff,woff2,ttf,eot,otf"' : '';

    let command = '';
    if (mode === 'crawl') {
      // Internal site crawler: stays strictly on the target domain up to depth 2, no foreign host traversal
      const domainFilter = hostname ? `--domains=${hostname} --no-parent` : '--no-parent';
      command = `"${wgetCmd}" -r -l 2 ${domainFilter} -p -k -E -e robots=off ${rejectFlag} --no-if-modified-since --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${websiteUrl}"`;
      onLog(`[Downloader] Starting site crawler (depth: 2, domain: ${hostname || 'local'})...`);
    } else {
      // Simple Cloner: captures target page and all its inline page requisites (images, CSS, JS) directly and rapidly
      command = `"${wgetCmd}" -p -k -E -e robots=off ${rejectFlag} --no-if-modified-since --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" "${websiteUrl}"`;
      onLog(`[Downloader] Starting simple cloner for: ${websiteUrl}`);
    }

    if (!downloadFonts) {
      onLog(`[Downloader] Font optimization: Skipping local font binaries (fonts load online from CDN for faster cloning)`);
    }

    const child = exec(command, { cwd: projectDir, maxBuffer: 1024 * 1024 * 50 });

    let fileCount = 0;
    let timedOut = false;

    // Safety timeout to prevent hanging forever
    const timer = setTimeout(() => {
      timedOut = true;
      onLog(`[Downloader] Safety timeout (${Math.round(timeoutMs / 1000)}s) reached. Finalizing captured assets...`);
      try {
        child.kill('SIGTERM');
      } catch (e) {}
    }, timeoutMs);

    child.stderr.on("data", (response) => {
      const responseText = response.toString();
      if (!website) {
        const resolvingMatch = responseText.match(/Resolving\s+([^\s]+)\s+\(/);
        if (resolvingMatch && resolvingMatch[1]) {
          website = resolvingMatch[1];
        }
      }

      const lines = responseText.split(/[\r\n]+/).filter(Boolean);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          if (trimmed.includes('200 OK') || trimmed.includes('saved [') || trimmed.includes('Saving to:')) {
            fileCount++;
          }
          // Emit clean meaningful progress to the UI
          if (
            trimmed.startsWith('--20') ||
            trimmed.includes('Resolving') ||
            trimmed.includes('Connecting') ||
            trimmed.includes('HTTP request sent') ||
            trimmed.includes('Saving to:') ||
            trimmed.includes('saved [') ||
            trimmed.includes('Converting links') ||
            trimmed.includes('FINISHED')
          ) {
            onLog(trimmed);
          }
        }
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      onLog(`[Downloader] wget process error: ${err.message}`);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const websiteFolder = website || getWebsiteFolderName(websiteUrl);
      const downloadedSitePath = path.join(projectDir, websiteFolder);

      onLog(`[Downloader] wget finished (${timedOut ? 'timed out' : 'exit code ' + code}). Post-processing files...`);

      // Post-process downloaded HTML files to fix percent-encoded image paths (e.g. Next.js image links)
      if (fs.existsSync(downloadedSitePath)) {
        fixDownloadedImagePaths(downloadedSitePath);
      }
      fixDownloadedImagePaths(projectDir);

      // Locate entry HTML file
      let entryFile = '';
      if (fs.existsSync(path.join(downloadedSitePath, 'index.html'))) {
        entryFile = `${websiteFolder}/index.html`;
      } else if (fs.existsSync(path.join(projectDir, 'index.html'))) {
        entryFile = 'index.html';
      } else {
        // Recursive search for any index.html or *.html in the project
        const findHtml = (dir, rel = '') => {
          if (!fs.existsSync(dir)) return null;
          const items = fs.readdirSync(dir, { withFileTypes: true });
          // Prioritize index.html
          for (const item of items) {
            if (item.isFile() && item.name.toLowerCase() === 'index.html') {
              return rel ? `${rel}/${item.name}` : item.name;
            }
          }
          for (const item of items) {
            const itemRel = rel ? `${rel}/${item.name}` : item.name;
            if (item.isDirectory() && !['node_modules', '.git'].includes(item.name)) {
              const res = findHtml(path.join(dir, item.name), itemRel);
              if (res) return res;
            } else if (item.isFile() && item.name.endsWith('.html')) {
              return itemRel;
            }
          }
          return null;
        };
        entryFile = findHtml(projectDir) || (websiteFolder ? `${websiteFolder}/index.html` : 'index.html');
      }

      onLog(`[Downloader] Download completed! Entry file: ${entryFile}`);

      resolve({
        websiteFolder,
        entryFile: entryFile.replace(/\\/g, '/'),
        projectDir,
        totalFiles: fileCount || 1,
        code
      });
    });
  });
}

module.exports = {
  download,
  fixDownloadedImagePaths,
  getWebsiteFolderName,
  wgetCmd
};

