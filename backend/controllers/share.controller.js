import { promisePool } from "../lib/db.js";

// GET /projects/:token/client-view  (Unprotected Magic Link view)
export const getClientView = async (req, res) => {
    try {
        const { token } = req.params;
        
        // 1. Get Project based on magic Token
        const projResult = await promisePool.query(
            `SELECT * FROM projects WHERE magic_link_token = $1`, 
            [token]
        );
        if (projResult.rowCount === 0) return res.status(404).json({ error: "Invalid link" });
        const project = projResult.rows[0];

        // 2. Fetch all maps for this project
        const mapsResult = await promisePool.query(
            `SELECT * FROM maps WHERE project_id = $1`, 
            [project.id]
        );
        const maps = mapsResult.rows;

        // 3. To make it extremely efficient, compile the arrays directly here
        const clientPayload = {
            project,
            maps: await Promise.all(maps.map(async (map) => {
                // Get pins for the floor
                const pinsReq = await promisePool.query(`SELECT * FROM pins WHERE map_id = $1`, [map.id]);
                let pins = pinsReq.rows;

                // Bind photos to each pin
                pins = await Promise.all(pins.map(async (pin) => {
                    const photosReq = await promisePool.query(`SELECT * FROM photos WHERE pin_id = $1`, [pin.id]);
                    return {
                        ...pin,
                        photos: photosReq.rows
                    };
                }));

                return {
                    ...map,
                    pins: pins
                };
            }))
        };

        // Output complete massive packaged payload for client rendering
        res.json(clientPayload);
    } catch (err) {
        console.error("Magic link error:", err);
        res.status(500).json({ error: "Failed to generate client report data." });
    }
};

// GET /projects/:projectId/magic-link
export const getMagicLinkToken = async (req, res) => {
    try {
        const { projectId } = req.params;
        const result = await promisePool.query(
            `SELECT magic_link_token FROM projects WHERE id = $1`, 
            [projectId]
        );
        if (!result.rowCount) return res.status(404).json({ error: "Project missing" });

        // Build the URL based on client host configuration in your env 
        // Or you can just return the raw string "abc-xyz..." for the frontend client app to compose.
        const tokenString = result.rows[0].magic_link_token;
        const urlString = `${process.env.CLIENT_BASE_URL}/view/${tokenString}`;
        
        res.json({ token: tokenString, public_url: urlString });
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
};

// GET /projects/:projectId/pdf
export const generateReportPdf = async (req, res) => {
    // 💡 Usually you would loop data into `pdfkit` / `puppeteer` here.
    // Assuming compiling images/map coords requires drawing directly to PDF streams:
    try {
        res.status(501).json({ 
            message: "PDF functionality generation pending Implementation detail (Recommended: Puppeteer HTML to PDF using the generated public link payload)." 
        });
    } catch(err) {
         res.status(500).json({ error: "Server Error" });
    }
};