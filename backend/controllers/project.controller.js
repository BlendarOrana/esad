import { promisePool } from "../lib/db.js";
import crypto from "crypto"; // To generate magic link strings

const generateMagicToken = () => {
    // Generates a short URL-friendly string e.g. "a3bc9-f2c1x-981pl"
    const p1 = crypto.randomBytes(3).toString("hex");
    const p2 = crypto.randomBytes(3).toString("hex");
    return `${p1}-${p2}`;
};

export const createProject = async (req, res) => {
    try {
        const { title, address, client_name } = req.body;
        const magic_link_token = generateMagicToken();
        const user_id = req.user.id; // From auth middleware

        const result = await promisePool.query(
            `INSERT INTO projects (user_id, title, address, client_name, magic_link_token) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [user_id, title, address, client_name, magic_link_token]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Create project err:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getProjects = async (req, res) => {
    try {
        const result = await promisePool.query(
            `SELECT * FROM projects WHERE user_id = $1 ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};

export const updateProject = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, address, client_name } = req.body;

        const result = await promisePool.query(
            `UPDATE projects SET title = $1, address = $2, client_name = $3 
             WHERE id = $4 AND user_id = $5 RETURNING *`,
            [title, address, client_name, id, req.user.id]
        );

        if (!result.rows.length) return res.status(404).json({ error: "Project not found" });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};

export const deleteProject = async (req, res) => {
    try {
        const result = await promisePool.query(
            `DELETE FROM projects WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: "Project not found" });
        res.json({ message: "Project deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
};