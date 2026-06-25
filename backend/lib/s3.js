import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || 
    !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_BUCKET_NAME) { 
  throw new Error('Missing required AWS environment variables (REGION, ACCESS_KEY_ID, SECRET_ACCESS_KEY, BUCKET_NAME)');
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const getContentType = (buffer, filename) => {
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    const contentTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain'
    };
    if (contentTypes[ext]) {
      return contentTypes[ext];
    }
  }
  
  if (buffer && buffer.length > 0) {
    const firstBytes = buffer.slice(0, 4);
    if (firstBytes[0] === 0xFF && firstBytes[1] === 0xD8) return 'image/jpeg';
    if (firstBytes[0] === 0x89 && firstBytes[1] === 0x50 && 
        firstBytes[2] === 0x4E && firstBytes[3] === 0x47) return 'image/png';
    if (firstBytes[0] === 0x25 && firstBytes[1] === 0x50 && 
        firstBytes[2] === 0x44 && firstBytes[3] === 0x46) return 'application/pdf';
    if (firstBytes[0] === 0x47 && firstBytes[1] === 0x49 && 
        firstBytes[2] === 0x46) return 'image/gif';
  }
  
  return 'application/octet-stream';
};

/**
 * Process image with Sharp
 */
export const processImageWithSharp = async (buffer, filename = null, options = {}) => {
  try {
    const defaultOptions = {
      maxWidth: 1920,
      maxHeight: 1080,
      quality: 85,
      format: 'webp',
      progressive: true,
      effort: 4,
      withoutEnlargement: true
    };

    const config = { ...defaultOptions, ...options };

    let pipeline = sharp(buffer).resize(config.maxWidth, config.maxHeight, {
      fit: 'inside',
      withoutEnlargement: config.withoutEnlargement
    });

    switch (config.format.toLowerCase()) {
      case 'webp':
        pipeline = pipeline.webp({
          quality: config.quality,
          effort: config.effort,
          progressive: config.progressive
        });
        break;
      case 'jpeg':
      case 'jpg':
        pipeline = pipeline.jpeg({
          quality: config.quality,
          progressive: config.progressive,
          mozjpeg: true
        });
        break;
      case 'png':
        pipeline = pipeline.png({
          progressive: config.progressive,
          compressionLevel: 9
        });
        break;
    }

    const { data: processedBuffer, info } = await pipeline.toBuffer({ resolveWithObject: true });
    
    // 🔧 FIX: Correct logic to prevent negative percentages sounding weird in logs
    const sizeDiffPercentage = ((buffer.length - processedBuffer.length) / buffer.length * 100).toFixed(2);

    return {
      buffer: processedBuffer,
      filename: filename,
      originalSize: buffer.length,
      processedSize: processedBuffer.length,
      compressionRatio: parseFloat(sizeDiffPercentage),
      format: config.format,
      dimensions: { width: info.width, height: info.height }
    };
  } catch (error) {
    console.error(`Error processing image with Sharp: ${error.message}`);
    throw new Error(`Image processing failed: ${error.message}`);
  }
};

/**
 * Upload file to S3
 */
/**
 * Upload file to S3
 * Automatically handles duplicate name collision prevention (makeUnique = true)
 */
export const uploadToS3 = async (
  buffer, 
  filePathInS3, 
  filename = null, 
  contentType = null, 
  processImages = true, 
  sharpOptions = {},
  makeUnique = true // ⬅️ NEW: Defaults to true to prevent overwrites
) => {
  if (!buffer || buffer.length === 0) {
    throw new Error('Buffer is empty or invalid');
  }
  
  if (!filePathInS3) {
    throw new Error('File path in S3 is required');
  }

  let finalBuffer = buffer;
  const detectedContentType = contentType || getContentType(buffer, filename);
  let finalContentType = detectedContentType;
  let finalS3Key = filePathInS3;
  let processingStats = null;

  if (makeUnique) {
    const lastSlashIndex = finalS3Key.lastIndexOf('/');
    const folderPath = lastSlashIndex !== -1 ? finalS3Key.substring(0, lastSlashIndex + 1) : '';
    const fullFileName = lastSlashIndex !== -1 ? finalS3Key.substring(lastSlashIndex + 1) : finalS3Key;
    
    // Split the name from its extension
    const lastDotIndex = fullFileName.lastIndexOf('.');
    const hasExt = lastDotIndex !== -1 && lastDotIndex > 0;
    
    const baseName = hasExt ? fullFileName.substring(0, lastDotIndex) : fullFileName;
    const originalExt = hasExt ? fullFileName.substring(lastDotIndex) : '';
    
    // Add a unique identifier: folder/my-image.jpg -> folder/my-image-1708453291023-xk8d9z.jpg
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    finalS3Key = `${folderPath}${baseName}-${uniqueSuffix}${originalExt}`;
  }

  const shouldProcessImage = processImages && detectedContentType.startsWith('image/');

  if (shouldProcessImage) {
    try {
      const processed = await processImageWithSharp(buffer, filename, sharpOptions);
      finalBuffer = processed.buffer;
      finalContentType = `image/${processed.format}`;
      
      // Update extension safely (e.g., .jpg becomes .webp)
      const extIndex = finalS3Key.lastIndexOf('.');
      if (extIndex !== -1 && extIndex > finalS3Key.lastIndexOf('/')) {
        finalS3Key = finalS3Key.substring(0, extIndex) + `.${processed.format}`;
      } else {
        finalS3Key = `${finalS3Key}.${processed.format}`;
      }
      
      processingStats = {
        originalSize: processed.originalSize,
        processedSize: processed.processedSize,
        compressionRatio: processed.compressionRatio,
        format: processed.format,
        dimensions: processed.dimensions
      };
      
      const word = processed.compressionRatio >= 0 ? 'reduction' : 'increase';
      console.log(`Image processed: ${processed.originalSize} → ${processed.processedSize} bytes (${Math.abs(processed.compressionRatio)}% ${word})`);
      
    } catch (processError) {
      console.warn(`Image processing failed, uploading original: ${processError.message}`);
    }
  }

  console.log(`Uploading to S3 key: ${finalS3Key}`);

  const uploadParams = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: finalS3Key, 
    Body: finalBuffer,
    ContentType: finalContentType,
    ServerSideEncryption: 'AES256',
    Metadata: {
      'upload-time': new Date().toISOString(),
      'original-filename': filename || 'unknown', // Original name is still saved safely here!
      ...(processingStats && {
        'original-size': processingStats.originalSize.toString(),
        'processed-size': processingStats.processedSize.toString(),
        'compression-ratio': processingStats.compressionRatio.toString(),
        'processed-format': processingStats.format
      })
    }
  };

  try {
    const data = await s3.send(new PutObjectCommand(uploadParams));
    
    return {
      Location: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${finalS3Key}`,
      CloudFrontUrl: process.env.CLOUDFRONT_DOMAIN ? 
        `https://${process.env.CLOUDFRONT_DOMAIN}/${finalS3Key}` : null,
      ETag: data.ETag,
      Key: finalS3Key,
      ContentType: finalContentType,
      ...(processingStats && { ProcessingStats: processingStats })
    };
  } catch (err) {
    console.error('Error uploading to S3:', err);
    throw new Error(`Error uploading to S3: ${err.message}`);
  }
};


export const uploadMultipleImages = async (files, folderPath, sharpOptions = {}) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('Files array is required and cannot be empty');
  }

  const uploadPromises = files.map(async (file, index) => {
    try {
      const rawName = file.originalname ? file.originalname.replace(/\s+/g, '-') : `file-${index}`;
      const baseKey = `${folderPath}/${rawName}`;
      
      const result = await uploadToS3(
        file.buffer, 
        baseKey, 
        file.originalname, 
        file.mimetype, 
        true, 
        sharpOptions,
        true // makeUnique flag is active
      );
      
      return {
        success: true,
        key: result.Key,
        url: result.CloudFrontUrl || result.Location,
        stats: result.ProcessingStats
      };
    } catch (error) {
      console.error(`Failed to upload file ${index}:`, error.message);
      return {
        success: false,
        error: error.message,
        filename: file.originalname || `file-${index}`
      };
    }
  });

  const results = await Promise.all(uploadPromises);
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  return {
    successful,
    failed,
    totalUploaded: successful.length,
    totalFailed: failed.length
  };
};

/**
 * Delete file from S3
 */
export const deleteFromS3 = async (filePathInS3) => {
  if (!filePathInS3) {
    console.warn('No file path provided for deletion');
    return null;
  }

  const deleteParams = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: filePathInS3,
  };

  try {
    const data = await s3.send(new DeleteObjectCommand(deleteParams));
    console.log(`Successfully deleted: ${filePathInS3}`);
    return data;
  } catch (err) {
    console.error(`Error deleting key "${filePathInS3}" from S3:`, err.message);
    return null;
  }
};


export const testS3Connection = async () => {
  try {
    const command = new HeadBucketCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
    });
    
    await s3.send(command);
    console.log('✅ S3 connection successful');
    return true;
  } catch (err) {
    console.error('❌ S3 connection failed:', err.message);
    return false;
  }
};

/**
 * Generate CloudFront URL
 */
export const getCloudFrontUrl = (key) => {
  if (!key || !process.env.CLOUDFRONT_DOMAIN) {
    return null;
  }
  return `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`;
};


export const getPresignedUrl = async (key, expiresIn = 3600) => {
  if (!key) {
    return null;
  }

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  });

  try {
    return await getSignedUrl(s3, command, { expiresIn });
  } catch (err) {
    console.error(`Error generating pre-signed URL for key "${key}":`, err.message);
    return null;
  }
};


export const getFileUrl = async (key) => {
  if (!key) {
    return null;
  }

  const cloudFrontUrl = getCloudFrontUrl(key);
  if (cloudFrontUrl) {
    return {
      url: cloudFrontUrl,
      type: 'cloudfront',
      expires: null
    };
  }

  const presignedUrl = await getPresignedUrl(key);
  if (presignedUrl) {
    return {
      url: presignedUrl,
      type: 'presigned',
      expires: new Date(Date.now() + 3600 * 1000)
    };
  }

  return null;
};