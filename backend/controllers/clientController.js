import { promisePool } from '../lib/db.js';
import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import { 
    Document, 
    Packer, 
    Paragraph, 
    TextRun, 
    HeadingLevel, 
    ImageRun, 
    Table, 
    TableRow, 
    TableCell, 
    BorderStyle, 
    WidthType, 
    AlignmentType,
    ShadingType
} from 'docx';
import { getSignedImageUrl } from '../lib/s3.js';

// --- HELPERS ---

/**
 * Downloads an image from a URL and returns a Buffer.
 * Essential for embedding images in Word documents.
 */
async function getImageBuffer(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (e) {
        console.error("Download Error:", e);
        return null;
    }
}

/**
 * Common Severity Styles for consistency between PDF and Word
 */
const SEVERITY_SETTINGS = {
    URGENT: { color: 'D00000', label: 'URGENT' },
    MODERATE: { color: 'FF8C00', label: 'MODERATE' },
    MINOR: { color: 'E1B000', label: 'MINOR' },
    DEFAULT: { color: '000000', label: 'INFO' }
};

const getSeverity = (sev) => SEVERITY_SETTINGS[sev?.toUpperCase()] || SEVERITY_SETTINGS.DEFAULT;

/**
 * Data Fetching Logic
 */
const fetchCompiledProjectData = async (identifier) => {
    const projResult = await promisePool.query(
        `SELECT p.*, u.name as engineer_name 
         FROM projects p 
         JOIN users u ON p.user_id = u.id 
         WHERE p.id = $1`, 
        [identifier]
    );

    if (projResult.rowCount === 0) return null;
    const project = projResult.rows[0];

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

            const photos = await Promise.all(photosReq.rows.map(async (ph) => {
                const signedUrl = await getSignedImageUrl(ph.image_url);
                return { ...ph, signed_url: signedUrl };
            }));

            return { ...pin, photos };
        }));
        return { ...map, pins };
    }));

    return { project, maps };
};

// --- PDF GENERATION ---
export const generateReportPdf = async (req, res) => {
    try {
        const data = await fetchCompiledProjectData(req.params.projectId);
        if (!data) return res.status(404).json({ error: "Project missing" });

        const htmlContent = `
            <html>
                <head>
                    <style>
                        body { font-family: 'Helvetica', Arial, sans-serif; padding: 40px; color: #000; }
                        .header { border-bottom: 5px solid #000; padding-bottom: 20px; margin-bottom: 40px; }
                        .brand { font-weight: bold; font-size: 14px; text-transform: uppercase; color: #666; }
                        .title { font-size: 32px; font-weight: 800; text-transform: uppercase; margin: 5px 0; }
                        .engineer-badge { background: #000; color: #fff; padding: 4px 10px; display: inline-block; font-weight: bold; margin-top: 10px; }
                        
                        .floor-title { font-size: 20px; font-weight: bold; border-bottom: 2px solid #000; margin: 40px 0 20px; text-transform: uppercase; }
                        
                        .pin-card { border: 1px solid #ddd; margin-bottom: 30px; page-break-inside: avoid; }
                        .pin-header { background: #f9f9f9; padding: 10px 15px; border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; }
                        .severity { font-weight: bold; }
                        .pin-body { padding: 15px; }
                        .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px; }
                        .photo-grid img { width: 100%; height: 250px; object-fit: cover; border: 1px solid #000; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <div class="brand">Swiss Safety Centre • Protocol</div>
                        <div class="title">${data.project.title}</div>
                        <div>${data.project.address || ''}</div>
                        <div class="engineer-badge">Inspected by: ${data.project.engineer_name}</div>
                    </div>
                    ${data.maps.map(floor => `
                        <div class="floor-title">${floor.name}</div>
                        ${floor.pins.map(pin => {
                            const sev = getSeverity(pin.severity);
                            return `
                                <div class="pin-card">
                                    <div class="pin-header">
                                        <span style="color: #${sev.color}">⚠ ${sev.label} ISSUE</span>
                                        <span style="color: #888">ID: #${pin.id}</span>
                                    </div>
                                    <div class="pin-body">
                                        <p>${pin.text_note}</p>
                                        <div class="photo-grid">
                                            ${pin.photos.map(ph => `<img src="${ph.signed_url}" />`).join('')}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    `).join('')}
                </body>
            </html>`;

        const browser = await puppeteer.launch({ headless: "new", args: ['--no-sandbox'] });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', bottom: '20px' } });
        await browser.close();

        res.contentType("application/pdf");
        res.send(pdf);
    } catch (err) {
        res.status(500).send("PDF Error");
    }
};

// --- WORD GENERATION ---
export const generateReportWord = async (req, res) => {
    try {
        const data = await fetchCompiledProjectData(req.params.projectId);
        if (!data) return res.status(404).send("Project missing");

        const children = [];

        // 1. Header Logic
        children.push(new Paragraph({
            children: [new TextRun({ text: "SWISS SAFETY CENTRE • PROTOCOL", size: 20, bold: true, color: "666666" })]
        }));
        children.push(new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: data.project.title.toUpperCase(), size: 56, bold: true })]
        }));
        children.push(new Paragraph({
            children: [
                new TextRun({ text: " INSPECTED BY: ", size: 20 }),
                new TextRun({ text: ` ${data.project.engineer_name} `, size: 20, bold: true, color: "FFFFFF", shading: { fill: "000000" } }),
            ],
            spacing: { after: 400 }
        }));

        // 2. Map & Pin Logic
        for (const floor of data.maps) {
            children.push(new Paragraph({
                text: floor.name.toUpperCase(),
                heading: HeadingLevel.HEADING_2,
                border: { bottom: { color: "000000", space: 1, value: BorderStyle.SINGLE, size: 12 } },
                spacing: { before: 400, after: 200 }
            }));

            for (const pin of floor.pins) {
                const sev = getSeverity(pin.severity);

                // Build "Card" with Table
                const pinTable = new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    shading: { fill: "F2F2F2" },
                                    children: [new Paragraph({
                                        children: [
                                            new TextRun({ text: `⚠ ${sev.label} ISSUE`, color: sev.color, bold: true }),
                                            new TextRun({ text: `    ID: #${pin.id}`, color: "888888", size: 18 })
                                        ]
                                    })]
                                })
                            ]
                        }),
                        new TableRow({
                            children: [
                                new TableCell({
                                    margins: { top: 200, bottom: 200, left: 100, right: 100 },
                                    children: [new Paragraph({ text: pin.text_note })]
                                })
                            ]
                        })
                    ]
                });
                children.push(pinTable);

                // 3. Image Grid Logic for Word
                if (pin.photos.length > 0) {
                    const rowCells = [];
                    for (const ph of pin.photos) {
                        const buffer = await getImageBuffer(ph.signed_url);
                        if (buffer) {
                            rowCells.push(new TableCell({
                                children: [
                                    new Paragraph({
                                        alignment: AlignmentType.CENTER,
                                        children: [
                                            new ImageRun({
                                                data: buffer,
                                                transformation: { width: 300, height: 220 }
                                            })
                                        ]
                                    })
                                ],
                                border: {
                                    top: { style: BorderStyle.SINGLE, size: 1 },
                                    bottom: { style: BorderStyle.SINGLE, size: 1 },
                                    left: { style: BorderStyle.SINGLE, size: 1 },
                                    right: { style: BorderStyle.SINGLE, size: 1 },
                                }
                            }));
                        }
                    }

                    // Arrange into 2 columns
                    for (let i = 0; i < rowCells.length; i += 2) {
                        const cells = [rowCells[i]];
                        cells.push(rowCells[i+1] ? rowCells[i+1] : new TableCell({ children: [] }));
                        children.push(new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: [new TableRow({ children: cells })]
                        }));
                    }
                }
                children.push(new Paragraph({ text: "", spacing: { after: 300 } })); // Spacer
            }
        }

        const doc = new Document({ sections: [{ children }] });
        const buffer = await Packer.toBuffer(doc);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=Report-${data.project.id}.docx`);
        res.send(buffer);
    } catch (err) {
        console.error(err);
        res.status(500).send("Word Generation Failed");
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