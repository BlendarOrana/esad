import { promisePool } from '../lib/db.js';
import PDFDocument from 'pdfkit';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { getSignedImageUrl } from "../lib/s3.js";

// Helper: Fetch an S3 image and return a JPEG Buffer.
// pdfkit can ONLY embed JPEG and PNG - anything else (WEBP, HEIC/HEIF from
// iPhones, GIF, TIFF, etc.) throws "Unknown image format". We normalize
// every image to JPEG here (smaller than PNG for photos) so the source
// format never matters downstream.
async function getImageBuffer(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch image (${response.status} ${response.statusText}) from ${url}`);
        }
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            console.warn(`Image Fetch Warning: unexpected content-type "${contentType}" for ${url}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const rawBuffer = Buffer.from(arrayBuffer);
        if (rawBuffer.length === 0) {
            throw new Error(`Empty buffer returned for ${url}`);
        }

        // Normalize to JPEG regardless of source format (webp/heic/gif/etc).
        // .flatten() fills any transparency with white before JPEG encoding,
        // since JPEG has no alpha channel. .rotate() applies EXIF orientation.
        const jpegBuffer = await sharp(rawBuffer)
            .rotate()
            .flatten({ background: '#ffffff' })
            .jpeg({ quality: 85 })
            .toBuffer();
        return jpegBuffer;
    } catch (e) {
        console.error("Image Fetch/Convert Error:", e.message);
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

            // 3. CONVERT IMAGES TO BUFFERS (The Fix)
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

const getSeverityStyle = (severity) => {
    switch (severity?.toUpperCase()) {
        case 'URGENT': return { color: '#d00000', label: 'URGENT' };
        case 'MODERATE': return { color: '#ff8c00', label: 'MODERATE' };
        case 'MINOR': return { color: '#e1b000', label: 'MINOR' };
        default: return { color: '#000000', label: 'INFO' };
    }
};

// Layout constants (mirrors the CSS in the puppeteer version)
const PAGE_MARGIN = { top: 40, bottom: 40, left: 20, right: 20 };
const PIN_HEADER_H = 26;
const PIN_PADDING = 15;
const PHOTO_GAP = 10;
const PHOTO_H = 140;
const PHOTO_COLS = 2;

export const generateReportPdf = async (req, res) => {
    try {
        const { projectId } = req.params;

        const data = await fetchCompiledProjectData(projectId);
        if (!data) return res.status(404).json({ error: "Project missing" });

        const doc = new PDFDocument({ size: 'A4', margins: PAGE_MARGIN, bufferPages: true });

        res.contentType("application/pdf");
        doc.pipe(res);

        const contentWidth = doc.page.width - PAGE_MARGIN.left - PAGE_MARGIN.right;

        const ensureSpace = (neededHeight) => {
            const bottomLimit = doc.page.height - PAGE_MARGIN.bottom;
            if (doc.y + neededHeight > bottomLimit) {
                doc.addPage();
            }
        };

        // ---------- HEADER ----------
        doc
            .fontSize(10)
            .fillColor('#333')
            .text('SWISS SAFETY CENTRE', PAGE_MARGIN.left, doc.y, { characterSpacing: 1 });

        doc
            .fontSize(28)
            .fillColor('#000')
            .font('Helvetica-Bold')
            .text((data.project.title || 'Untitled Project').toUpperCase(), PAGE_MARGIN.left, doc.y + 4);

        doc
            .fontSize(11)
            .font('Helvetica')
            .fillColor('#333')
            .text(data.project.address || 'No Address Provided', PAGE_MARGIN.left, doc.y + 4);

        // Engineer name badge (black background, white text)
        const engineerLabel = `Engineer: `;
        const engineerName = data.project.engineer_name || 'N/A';
        doc.moveDown(0.5);
        const badgeY = doc.y;
        doc.fontSize(11).font('Helvetica');
        const labelWidth = doc.widthOfString(engineerLabel);
        doc.fillColor('#333').text(engineerLabel, PAGE_MARGIN.left, badgeY, { continued: false });

        doc.font('Helvetica-Bold');
        const nameWidth = doc.widthOfString(engineerName) + 16;
        const badgeX = PAGE_MARGIN.left + labelWidth;
        doc.rect(badgeX, badgeY - 2, nameWidth, 18).fill('#000');
        doc.fillColor('#fff').text(engineerName, badgeX + 8, badgeY, { width: nameWidth - 16 });

        doc.moveDown(1);
        doc.fillColor('#000');

        // Header bottom border
        const headerBottomY = doc.y + 5;
        doc.moveTo(PAGE_MARGIN.left, headerBottomY)
            .lineTo(doc.page.width - PAGE_MARGIN.right, headerBottomY)
            .lineWidth(4)
            .strokeColor('#000')
            .stroke();

        doc.y = headerBottomY + 25;

        // ---------- FLOORS / MAPS ----------
        for (const floor of data.maps) {
            ensureSpace(40);

            doc
                .fontSize(18)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text(`AREA: ${floor.name}`, PAGE_MARGIN.left, doc.y, { width: contentWidth });

            const floorTitleBottomY = doc.y + 4;
            doc.moveTo(PAGE_MARGIN.left, floorTitleBottomY)
                .lineTo(doc.page.width - PAGE_MARGIN.right, floorTitleBottomY)
                .lineWidth(1)
                .strokeColor('#000')
                .stroke();

            doc.y = floorTitleBottomY + 15;

            if (floor.pins.length === 0) {
                doc.fontSize(11).font('Helvetica').fillColor('#333')
                    .text('No pins in this area.', PAGE_MARGIN.left, doc.y);
                doc.moveDown(1);
                continue;
            }

            for (const pin of floor.pins) {
                const style = getSeverityStyle(pin.severity);
                const noteText = pin.text_note || 'No notes provided.';

                // Estimate card height before drawing, so we can page-break cleanly
                doc.fontSize(11).font('Helvetica');
                const noteHeight = doc.heightOfString(noteText, { width: contentWidth - PIN_PADDING * 2 });

                const photoRows = Math.ceil((pin.photos?.length || 0) / PHOTO_COLS);
                const photosHeight = photoRows > 0 ? photoRows * (PHOTO_H + PHOTO_GAP) : 0;

                const cardHeight = PIN_HEADER_H + PIN_PADDING + noteHeight + 10 + photosHeight + PIN_PADDING;

                ensureSpace(cardHeight + 20);

                const cardX = PAGE_MARGIN.left;
                const cardY = doc.y;
                const cardWidth = contentWidth;

                // Card border
                doc.roundedRect(cardX, cardY, cardWidth, cardHeight, 6)
                    .lineWidth(1)
                    .strokeColor('#ddd')
                    .stroke();

                // Card header (grey background)
                doc.rect(cardX, cardY, cardWidth, PIN_HEADER_H).fill('#f5f5f5');
                doc.fontSize(11).font('Helvetica-Bold').fillColor(style.color)
                    .text(`${style.label} ISSUE`, cardX + 10, cardY + 7);

                // Card body
                let bodyY = cardY + PIN_HEADER_H + PIN_PADDING;
                doc.fontSize(11).font('Helvetica').fillColor('#333')
                    .text(noteText, cardX + PIN_PADDING, bodyY, { width: cardWidth - PIN_PADDING * 2 });

                bodyY = bodyY + noteHeight + 10;

                // Photo grid (2 columns)
                if (pin.photos && pin.photos.length > 0) {
                    const gridWidth = cardWidth - PIN_PADDING * 2;
                    const photoWidth = (gridWidth - PHOTO_GAP) / PHOTO_COLS;

                    pin.photos.forEach((ph, idx) => {
                        const col = idx % PHOTO_COLS;
                        const row = Math.floor(idx / PHOTO_COLS);
                        const x = cardX + PIN_PADDING + col * (photoWidth + PHOTO_GAP);
                        const y = bodyY + row * (PHOTO_H + PHOTO_GAP);

                        if (!ph.buffer) {
                            console.warn(`Skipping photo id=${ph.id} for pin=${pin.id}: no buffer (see "Image Fetch/Convert Error" above)`);
                            return;
                        }

                        try {
                            // Use `fit` ALONE to constrain + center the image in the box.
                            // Do NOT also pass width/height - combining them with `fit`
                            // is what was silently breaking image rendering.
                            doc.image(ph.buffer, x, y, {
                                fit: [photoWidth, PHOTO_H],
                                align: 'center',
                                valign: 'center'
                            });
                        } catch (imgErr) {
                            console.error(`PDFKit image draw error (photo id=${ph.id}, pin=${pin.id}):`, imgErr.message);
                        }
                    });
                }

                doc.y = cardY + cardHeight + 20;
                doc.fillColor('#000');
            }
        }

        doc.end();

    } catch (err) {
        // CRITICAL: Look at your terminal when this happens!
        console.error("PDF GENERATION ERROR DETAILS:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to generate PDF", details: err.message });
        } else {
            res.end();
        }
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