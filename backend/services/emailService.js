import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logoPath = path.join(__dirname, '..', 'assets', 'Kosovamed.png');

// Create transporter with Brevo SMTP credentials
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP connection error:', error);
  } else {
    console.log('SMTP server is ready to send emails');
  }
});

/**
 * Send registration pending approval email
 * @param {string} userEmail - Recipient email address
 * @param {string} userName - User's name
 */
export const sendRegistrationPendingEmail = async (userEmail, userName) => {
  const mailOptions = {
    from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
    to: userEmail,
    subject: 'Konfirmim: Përdoruesi është në pritje të miratimit',
    html: `
      <!DOCTYPE html>
      <html lang="sq">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #000000;
            color: white;
            padding: 30px 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .header img {
            max-width: 200px;
            height: auto;
          }
          .content {
            background-color: #f9f9f9;
            padding: 30px;
            border: 1px solid #ddd;
            border-radius: 0 0 5px 5px;
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 20px;
          }
          .message {
            margin-bottom: 20px;
          }
          .info-box {
            background-color: #fff;
            border-left: 4px solid #09a8fa;
            padding: 15px;
            margin: 20px 0;
          }
          .info-box ul {
            margin: 10px 0;
            padding-left: 20px;
          }
          .footer {
            margin-top: 30px;
            font-size: 14px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <!-- CID reference here -->
          <img src="cid:kosovamedlogo" alt="${process.env.SENDER_NAME}" />
        </div>
        <div class="content">
          <div class="greeting">
            <strong>I nderuar/e nderuar ${userName},</strong>
          </div>
          
          <div class="message">
            <p>Faleminderit që u regjistruat në platformën tonë.</p>
            
            <p>Ju njoftojmë se kërkesa juaj për krijimin e llogarisë është pranuar me sukses. 
            Aktualisht, llogaria juaj është në proces verifikimi dhe kërkon aprovimin e zyrtarëve përgjegjës.</p>
          </div>
          
          <div class="info-box">
            <strong>Derisa verifikimi të përfundojë:</strong>
            <ul>
              <li>Nuk do të keni ende qasje të plotë në sistem.</li>
              <li>Do të njoftoheni me email sapo kërkesa juaj të aprovohet.</li>
            </ul>
          </div>
          
          <div class="footer">
            <p>Nëse keni ndonjë pyetje shtesë, ju lutemi na kontaktoni në <strong>info@kosovamed.com</strong>.</p>
            <p>Me respekt,<br>Ekipi i ${process.env.SENDER_NAME}</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
I nderuar/e nderuar ${userName},

Faleminderit që u regjistruat në platformën tonë.

Ju njoftojmë se kërkesa juaj për krijimin e llogarisë është pranuar me sukses. Aktualisht, llogaria juaj është në proces verifikimi dhe kërkon aprovimin e zyrtarëve përgjegjës.

Derisa verifikimi të përfundojë:
• Nuk do të keni ende qasje të plotë në sistem.
• Do të njoftoheni me email sapo kërkesa juaj të aprovohet.

Nëse keni ndonjë pyetje shtesë, ju lutemi na kontaktoni në info@kosovamed.com.

Me respekt,
Ekipi i ${process.env.SENDER_NAME}
    `,
    // ATTACHMENT CONFIG ADDED HERE
    attachments: [
      {
        filename: 'Kosovamed.png',
        path: logoPath,
        cid: 'kosovamedlogo' // Same as in the HTML src
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};


export default transporter;



export const sendForgotPasswordEmail = async (userEmail, link) => {
  const mailOptions = {
    from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
    to: userEmail,
    subject: 'Rivendosja e fjalëkalimit',
    html: `
      <!DOCTYPE html>
      <html lang="sq">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #000000;
            color: white;
            padding: 30px 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .header img {
            max-width: 200px;
            height: auto;
          }
          .content {
            background-color: #f9f9f9;
            padding: 30px;
            border: 1px solid #ddd;
            border-radius: 0 0 5px 5px;
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 20px;
          }
          .message {
            margin-bottom: 20px;
          }
          .btn-container {
            text-align: center;
            margin: 30px 0;
          }
          .btn {
            background-color: #09a8fa;
            color: white !important;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            display: inline-block;
          }
          .info-box {
            background-color: #fff;
            border-left: 4px solid #09a8fa;
            padding: 15px;
            margin: 20px 0;
            font-size: 14px;
          }
          .small-text {
             font-size: 12px;
             color: #777;
             word-break: break-all;
             margin-top: 15px;
          }
          .footer {
            margin-top: 30px;
            font-size: 14px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <!-- Logo referenced via CID to match the other email -->
          <img src="cid:kosovamedlogo" alt="${process.env.SENDER_NAME}" />
        </div>
        <div class="content">
          <div class="greeting">
            <strong>Përshëndetje,</strong>
          </div>
          
          <div class="message">
            <p>Kemi marrë një kërkesë për të ndryshuar fjalëkalimin tuaj në platformën ${process.env.SENDER_NAME}.</p>
            <p>Nëse keni bërë këtë kërkesë, ju lutemi klikoni butonin më poshtë për të vendosur fjalëkalimin e ri:</p>
          </div>

          <div class="btn-container">
            <a href="${link}" class="btn">Rivendos Fjalëkalimin</a>
          </div>
          
          <div class="info-box">
            <strong>Shënim:</strong> Ky link vlen vetëm për 15 minuta.
            <br/>Nëse nuk keni bërë ju kërkesë për ndryshim të fjalëkalimit, ju lutemi injorojeni këtë email.
          </div>
          
          <div class="small-text">
            Nëse butoni nuk funksionon, kopjoni dhe hapni këtë link në website :<br>
            ${link}
          </div>
          
          <div class="footer">
            <p>Nëse keni ndonjë problem, na kontaktoni në <strong>info@kosovamed.com</strong>.</p>
            <p>Me respekt,<br>Ekipi i ${process.env.SENDER_NAME}</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Përshëndetje,

Kemi marrë një kërkesë për të ndryshuar fjalëkalimin tuaj.

Kliko linkun më poshtë për të krijuar një fjalëkalim të ri (Linku vlen për 15 minuta):
${link}

Nëse nuk keni bërë ju kërkesë për ndryshim të fjalëkalimit, ju lutemi injorojeni këtë email.

Me respekt,
Ekipi i ${process.env.SENDER_NAME}
    `,
    // Attachment MUST be here for the image to work in the header
    attachments: [
      {
        filename: 'Kosovamed.png',
        path: logoPath,
        cid: 'kosovamedlogo'
      }
    ]
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Reset email sent to:", userEmail);
    return { success: true };
  } catch (error) {
    console.error("Email error:", error);
    throw error;
  }
};






export const sendUserAcceptedEmail = async (userEmail, userName, shift) => {
  // Përcakto emrin e ndërrimit bazuar në numrin
  const shiftMap = {
    1: 'Paradite',
    2: 'Pasdite',
    3: 'Vikendeve'
  };
  
  const shiftName = shiftMap[shift] || 'E pacaktuar';

  const mailOptions = {
    from: `"${process.env.SENDER_NAME}" <${process.env.SENDER_EMAIL}>`,
    to: userEmail,
    subject: 'Konfirmim: Llogaria juaj është aprovuar',
    html: `
      <!DOCTYPE html>
      <html lang="sq">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #000000;
            color: white;
            padding: 30px 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .header img {
            max-width: 200px;
            height: auto;
          }
          .content {
            background-color: #f9f9f9;
            padding: 30px;
            border: 1px solid #ddd;
            border-radius: 0 0 5px 5px;
          }
          .greeting {
            font-size: 18px;
            margin-bottom: 20px;
          }
          .message {
            margin-bottom: 20px;
          }
          .info-box {
            background-color: #fff;
            border-left: 4px solid #09a8fa;
            padding: 15px;
            margin: 20px 0;
          }


          .info-box ul {
            margin: 10px 0;
            padding-left: 20px;
          }
          .footer {
            margin-top: 30px;
            font-size: 14px;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="cid:kosovamedlogo" alt="${process.env.SENDER_NAME}" />
        </div>
        <div class="content">
          <div class="greeting">
            <strong>I nderuar/e nderuar ${userName},</strong>
          </div>
          
          <div class="message">
            <p>Faleminderit për durimin tuaj.</p>
            
            <p>Ju njoftojmë se llogaria juaj është <strong>aprovuar me sukses</strong> nga stafi ynë. 
            Tani keni qasje të plotë në të gjitha funksionet e platformës sonë.</p>
          </div>
          
          <div class="info-box">
            <strong>Detajet e llogarisë suaj:</strong>
            <ul>
              <li><strong>Statusi:</strong> Aktiv</li>
              <li><strong>Ndërrimi i caktuar:</strong> ${shiftName}</li>
            </ul>
            <p style="margin-top: 10px; font-size: 14px;">Mund të kyçeni tani duke përdorur numrin e id  dhe fjalëkalimin tuaj.</p>
          </div>
          
          <div class="footer">
            <p>Nëse keni ndonjë pyetje shtesë, ju lutemi na kontaktoni në <strong>info@kosovamed.com</strong>.</p>
            <p>Me respekt,<br>Ekipi i ${process.env.SENDER_NAME}</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
I nderuar/e nderuar ${userName},

Faleminderit për durimin tuaj.

Ju njoftojmë se llogaria juaj është aprovuar me sukses nga stafi ynë. Tani keni qasje të plotë në të gjitha funksionet e platformës sonë.

Detajet e llogarisë suaj:
• Statusi: Aktiv
• Ndërrimi i caktuar: ${shiftName}

Mund të kyçeni tani duke përdorur numrin e id dhe fjalëkalimin tuaj.

Nëse keni ndonjë pyetje shtesë, ju lutemi na kontaktoni në info@kosovamed.com.

Me respekt,
Ekipi i ${process.env.SENDER_NAME}
    `,
    attachments: [
      {
        filename: 'Kosovamed.png',
        path: logoPath, // Sigurohu qe 'logoPath' eshte deklaruar lart ne file ashtu si te emaili i kaluar
        cid: 'kosovamedlogo'
      }
    ]
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Accepted email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending accepted email:', error);
    throw error;
  }
};