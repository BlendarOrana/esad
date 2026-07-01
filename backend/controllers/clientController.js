import { promisePool } from '../lib/db.js';
import PDFDocument from 'pdfkit';
import fetch from 'node-fetch';
import { getSignedImageUrl } from "../lib/s3.js";

// Helper: Convert S3 URL to Buffer for PDFKit
async function getImageBuffer(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image`);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (e) {
        console.error("Image Fetch Error:", e);
        return null; 
    }
}

const fetchCompiledProjectData = async (projectId) => {
    const projResult = await promisePool.query(
        `SELECT p.*, u.name as engineer_name 
         FROM projects p 
         JOIN users u ON p.user_id = u.id 
         WHERE p.id = $1`, 
        [projectId]
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

            const photosWithBuffers = await Promise.all(photosReq.rows.map(async (ph) => {
                const signedUrl = await getSignedImageUrl(ph.image_url);
                const buffer = await getImageBuffer(signedUrl);
                return { ...ph, buffer };
            }));

            return { ...pin, photos: photosWithBuffers };
        }));
        return { ...map, pins };
    }));

    return { project, maps };
};

export const generateReportPdf = async (req, res) => {
    try {
        const { projectId } = req.params;
        const data = await fetchCompiledProjectData(projectId);
        if (!data) return res.status(404).json({ error: "Project missing" });

        // Initialize PDF Document
        const doc = new PDFDocument({ size: 'A4', margin: 40 });

        // Stream the PDF directly to the response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=report-${projectId}.pdf`);
        doc.pipe(res);

        // --- STYLING HELPERS ---
        const getSeverityColor = (severity) => {
            switch (severity?.toUpperCase()) {
                case 'URGENT': return '#d00000';
                case 'MODERATE': return '#ff8c00';
                case 'MINOR': return '#e1b000';
                default: return '#000000';
            }
        };

        // --- HEADER SECTION ---
        doc.fontSize(8).fillColor('#333').text('SWISS SAFETY CENTRE', { characterSpacing: 1 });
        doc.moveDown(0.5);
        
        doc.fontSize(24).fillColor('#000').font('Helvetica-Bold').text(data.project.title?.toUpperCase() || 'UNTITLED PROJECT');
        doc.fontSize(12).font('Helvetica').text(data.project.address || 'No Address Provided');
        
        // Engineer Tag (Black box with white text)
        doc.moveDown(1);
        const engineerText = ` ENGINEER: ${data.project.engineer_name || 'N/A'} `;
        const textWidth = doc.widthOfString(engineerText);
        const textHeight = 18;
        doc.rect(doc.x, doc.y, textWidth, textHeight).fill('#000');
        doc.fillColor('#fff').text(engineerText, doc.x, doc.y + 3);
        
        // Header Border Line
        doc.moveDown(1.5);
        doc.moveTo(40, doc.y).lineTo(555, doc.y).lineWidth(3).strokeColor('#000').stroke();
        doc.moveDown(2);

        // --- CONTENT SECTION ---
        for (const floor of data.maps) {
            // Check if we need a new page for the Area title
            if (doc.y > 700) doc.addPage();

            doc.fillColor('#000').font('Helvetica-Bold').fontSize(14).text(`AREA: ${floor.name.toUpperCase()}`);
            doc.moveTo(doc.x, doc.y).lineTo(555, doc.y).lineWidth(0.5).strokeColor('#ccc').stroke();
            doc.moveDown(1);

            if (floor.pins.length === 0) {
                doc.fillColor('#666').font('Helvetica').fontSize(10).text('No pins in this area.');
                doc.moveDown(2);
            }

            for (const pin of floor.pins) {
                const color = getSeverityColor(pin.severity);
                
                // Add new page if block won't fit
                if (doc.y > 650) doc.addPage();

                // Draw Pin Card Header
                const startY = doc.y;
                doc.rect(40, startY, 515, 20).fill('#f5f5f5');
                doc.fillColor(color).font('Helvetica-Bold').fontSize(10).text(`${pin.severity || 'INFO'} ISSUE`, 50, startY + 6);

                // Draw Pin Card Body
                doc.fillColor('#333').font('Helvetica').fontSize(11).text(pin.text_note || 'No notes provided.', 50, startY + 30, { width: 495 });
                
                doc.moveDown(1);

                // --- PHOTO GRID (2 Columns) ---
                if (pin.photos && pin.photos.length > 0) {
                    const columnWidth = 245;
                    const gutter = 10;
                    let currentX = 50;
                    let rowMaxHeight = 0;

                    for (let i = 0; i < pin.photos.length; i++) {
                        const photo = pin.photos[i];
                        if (!photo.buffer) continue;

                        // Check for page break inside photos
                        if (doc.y > 700) {
                            doc.addPage();
                            currentX = 50;
                        }

                        try {
                            doc.image(photo.buffer, currentX, doc.y, {
                                fit: [columnWidth, 180],
                                align: 'center'
                            });
                        } catch (err) {
                            console.error("PDFKit Image Error", err);
                        }

                        if (i % 2 === 0) {
                            // Move to second column
                            currentX += columnWidth + gutter;
                        } else {
                            // Move to next row
                            currentX = 50;
                            doc.moveDown(11); // Move down roughly the height of the image
                        }
                    }
                }

                // Add border around the card (optional)
                const endY = doc.y;
                doc.rect(40, startY, 515, (endY - startY) + 10).lineWidth(0.5).strokeColor('#ddd').stroke();
                doc.moveDown(2);
            }
        }

        // Finalize
        doc.end();

    } catch (err) {
        console.error("PDFKIT ERROR:", err);
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