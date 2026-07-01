import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import dotenv from 'dotenv';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


dotenv.config();

if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_BUCKET_NAME) {
    throw new Error('Missing required AWS environment variables');
}

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});




export const processImageWithSharp = async (buffer, filename = null, options = {}) => {
    try {
        const config = { maxWidth: 1920, maxHeight: 1080, quality: 85, format: 'webp', ...options };
        
        let pipeline = sharp(buffer).resize(config.maxWidth, config.maxHeight, {
            fit: 'inside',
            withoutEnlargement: true
        });

        pipeline = pipeline.webp({ quality: config.quality, effort: 4, progressive: true });

        const { data: processedBuffer, info } = await pipeline.toBuffer({ resolveWithObject: true });
        const sizeDiffPercentage = (((buffer.length - processedBuffer.length) / buffer.length) * 100).toFixed(2);

        return {
            buffer: processedBuffer,
            filename: filename,
            originalSize: buffer.length,
            processedSize: processedBuffer.length,
            compressionRatio: parseFloat(sizeDiffPercentage),
            format: 'webp',
            dimensions: { width: info.width, height: info.height }
        };
    } catch (error) {
        console.error(`Error processing image: ${error.message}`);
        throw new Error(`Image processing failed: ${error.message}`);
    }
};

export const uploadToS3 = async (buffer, filePathInS3, filename = null, contentType = null) => {
    if (!buffer || buffer.length === 0) throw new Error('Buffer is empty');

    let finalS3Key = filePathInS3;
    let finalBuffer = buffer;
    let finalContentType = contentType || 'image/webp';

    // 1. Make filename unique
    const lastSlashIndex = finalS3Key.lastIndexOf('/');
    const folderPath = lastSlashIndex !== -1 ? finalS3Key.substring(0, lastSlashIndex + 1) : '';
    const fullFileName = lastSlashIndex !== -1 ? finalS3Key.substring(lastSlashIndex + 1) : finalS3Key;
    const baseName = fullFileName.split('.')[0];
    
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    finalS3Key = `${folderPath}${baseName}-${uniqueSuffix}.webp`;

    // 2. Process Image
    try {
        const processed = await processImageWithSharp(buffer, filename);
        finalBuffer = processed.buffer;
    } catch (err) {
        console.warn(`Skipping sharp, uploading original: ${err.message}`);
    }

    // 3. Upload to S3
    const uploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: finalS3Key,
        Body: finalBuffer,
        ContentType: finalContentType,
        ServerSideEncryption: 'AES256'
    };

    try {
        await s3.send(new PutObjectCommand(uploadParams));
        return { Key: finalS3Key };
    } catch (err) {
        console.error(`S3 Upload Error: ${err.message}`);
        throw new Error(`S3 Upload failed`);
    }
};

export const uploadMultipleImages = async (files, folderPath) => {
    if (!Array.isArray(files) || files.length === 0) throw new Error('Files required');

    const uploadPromises = files.map(async (file, index) => {
        try {
            const rawName = file.originalname ? file.originalname.replace(/\s+/g, '-') : `file-${index}`;
            const baseKey = `${folderPath}/${rawName}`;
            
            const result = await uploadToS3(file.buffer, baseKey, file.originalname, file.mimetype);
            
            return { success: true, key: result.Key };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    const results = await Promise.all(uploadPromises);
    return {
        successful: results.filter(r => r.success),
        failed: results.filter(r => !r.success),
        totalFailed: results.filter(r => !r.success).length
    };
};

export const deleteFromS3 = async (filePathInS3) => {
    if (!filePathInS3) return null;

    try {
        await s3.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: filePathInS3,
        }));
        return true;
    } catch (err) {
        console.error(`S3 Delete Error: ${err.message}`);
        return false;
    }
};




export const getSignedImageUrl = async (key, expiresIn = 3600) => {
    if (!key) return null;
    try {
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key,
        });
        return await getSignedUrl(s3, command, { expiresIn });
    } catch (err) {
        console.error(`Failed to sign URL for ${key}: ${err.message}`);
        return null;
    }
};