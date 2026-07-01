import { promisePool } from '../lib/db.js';
import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import { getSignedImageUrl } from "../lib/s3.js";

// Helper: Convert S3 URL to Base64 string
async function getBase64Image(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type');
        return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
    } catch (e) {
        console.error("Image Fetch Error:", e);
        return null; // Return null so the PDF still generates without this image
    }
}

const fetchCompiledProjectData = async (projectId) => {
    // 1. Get Project AND Engineer Name
    const projResult = await promisePool.query(
        `SELECT p.*, u.name as engineer_name 
         FROM projects p 
         JOIN users u ON p.user_id = u.id 
         WHERE p.id = $1`, 
        [projectId]
    );

    if (projResult.rowCount === 0) return null;
    const project = projResult.rows[0];

    // 2. Get Maps
    const mapsResult = await promisePool.query(
        `SELECT * FROM maps WHERE project_id = $1 ORDER BY created_at ASC`, 
        [project.id]
    );

    const maps = await Promise.all(mapsResult.rows.map(async (map) => {
        const pinsReq = await promisePool.query(
            `SELECT * FROM pins WHERE map_id = $1 ORDER BY created_at DESC`, 
            [map.id]
        );
        
        const pins = await Promise.all(pinsReq.rows.map(async (pin) => {
            const photosReq = await promisePool.query(
                `SELECT * FROM photos WHERE pin_id = $1`, 
                [pin.id]
            );

            // 3. CONVERT IMAGES TO BASE64 (The Fix)
            const photosWithBase64 = await Promise.all(photosReq.rows.map(async (ph) => {
                const signedUrl = await getSignedImageUrl(ph.image_url);
                const base64Data = await getBase64Image(signedUrl);
                return { ...ph, base64: base64Data };
            }));

            return { ...pin, photos: photosWithBase64 };
        }));
        return { ...map, pins };
    }));

    return { project, maps };
};

export const generateReportPdf = async (req, res) => {
    let browser;
    try {
        const { projectId } = req.params;

        const data = await fetchCompiledProjectData(projectId);
        if (!data) return res.status(404).json({ error: "Project missing" });

        const getSeverityStyle = (severity) => {
            switch (severity?.toUpperCase()) {
                case 'URGENT': return { color: '#d00000', label: 'URGENT' };
                case 'MODERATE': return { color: '#ff8c00', label: 'MODERATE' };
                case 'MINOR': return { color: '#e1b000', label: 'MINOR' };
                default: return { color: '#000000', label: 'INFO' };
            }
        };

        const htmlContent = `
            <html>
                <head>
                    <style>
                        body { font-family: 'Helvetica', Arial, sans-serif; padding: 30px; color: #333; }
                        .header { border-bottom: 4px solid #000; padding-bottom: 15px; margin-bottom: 30px; }
                        .project-title { font-size: 28px; font-weight: bold; text-transform: uppercase; margin: 0; }
                        .engineer-name { background: #000; color: #fff; padding: 2px 8px; font-weight: bold; }
                        .floor-block { margin-top: 30px; page-break-before: auto; }
                        .floor-title { font-size: 18px; font-weight: 700; border-bottom: 1px solid #000; margin-bottom: 15px; }
                        .pin-card { border: 1px solid #ddd; margin-bottom: 20px; page-break-inside: avoid; border-radius: 8px; overflow: hidden; }
                        .pin-header { background: #f5f5f5; padding: 10px; font-weight: bold; }
                        .pin-body { padding: 15px; }
                        .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
                        .photo-grid img { width: 100%; height: 200px; object-fit: cover; border-radius: 4px; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div style="font-size: 10px; letter-spacing: 1px;">SWISS SAFETY CENTRE</div>
                        <h1 class="project-title">${data.project.title || 'Untitled Project'}</h1>
                        <p>${data.project.address || 'No Address Provided'}</p>
                        <div>Engineer: <span class="engineer-name">${data.project.engineer_name || 'N/A'}</span></div>
                    </div>

                    ${data.maps.map(floor => `
                        <div class="floor-block">
                            <div class="floor-title">AREA: ${floor.name}</div>
                            ${floor.pins.length === 0 ? '<p>No pins in this area.</p>' : floor.pins.map(pin => {
                                const style = getSeverityStyle(pin.severity);
                                return `
                                    <div class="pin-card">
                                        <div class="pin-header">
                                            <span style="color: ${style.color}">${style.label} ISSUE</span>
                                        </div>
                                        <div class="pin-body">
                                            <p>${pin.text_note || 'No notes provided.'}</p>
                                            <div class="photo-grid">
                                                ${pin.photos.map(ph => ph.base64 ? `<img src="${ph.base64}" />` : '').join('')}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `).join('')}
                </body>
            </html>`;

        // Launch browser with more stable settings
        browser = await puppeteer.launch({ 
            headless: "new", 
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null, // Useful for Docker
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // Prevents crashes in low-memory environments
            ] 
        });
        
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle2' });
        
        const pdf = await page.pdf({ 
            format: 'A4', 
            printBackground: true,
            margin: { top: '40px', bottom: '40px', left: '20px', right: '20px' } 
        });
        
        await browser.close();

        res.contentType("application/pdf");
        res.send(pdf);

    } catch (err) {
        if (browser) await browser.close();
        // CRITICAL: Look at your terminal when this happens!
        console.error("PDF GENERATION ERROR DETAILS:", err);
        res.status(500).json({ error: "Failed to generate PDF", details: err.message });
    }
};

export const getMagicLinkToken = async (req, res) => {
    try {
        const result = await promisePool.query(`SELECT magic_link_token FROM projects WHERE id = $1`, [req.params.projectId]);
        if (!result.rowCount) return res.status(404).json({ error: "Project missing" });
        const urlString = `${process.env.CLIENT_BASE_URL}/view/${result.rows[0].magic_link_token}`;
        res.json({ public_url: urlString });
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
};