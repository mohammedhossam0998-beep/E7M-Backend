const nodemailer = require("nodemailer");

// ============================================================
// SMTP TRANSPORTER
// ============================================================

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),

  secure: String(process.env.SMTP_PORT) === "465",

  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ============================================================
// VERIFY SMTP CONNECTION
// ============================================================

const verifyEmailConnection = async () => {
  try {
    await transporter.verify();

    console.log("✅ SMTP email service connected");
  } catch (error) {
    console.error("❌ SMTP CONNECTION ERROR:", error.message);
  }
};

// ============================================================
// SEND PASSWORD RESET EMAIL
// ============================================================

const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  try {
    console.log("📧 START SENDING PASSWORD RESET EMAIL");
    console.log("📧 FROM:", process.env.SMTP_FROM);
    console.log("📧 TO:", to);
    console.log("📧 RESET URL:", resetUrl);

    const mailOptions = {
      from: `"E7M" <${process.env.SMTP_FROM}>`,

      to,

      subject: "Reset Your E7M Password",

      text: `
Hello,

We received a request to reset your E7M account password.

Use the following link to reset your password:

${resetUrl}

This link will expire in ${
        process.env.PASSWORD_RESET_EXPIRES_MINUTES || 30
      } minutes.

If you did not request a password reset, you can safely ignore this email.

Regards,
E7M Team
`,

      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Reset Your E7M Password</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f7fb;
    font-family:Arial,sans-serif;
  "
>

  <div
    style="
      max-width:600px;
      margin:40px auto;
      background:#ffffff;
      border-radius:12px;
      padding:35px;
      box-sizing:border-box;
    "
  >

    <h2 style="color:#123C88;">
      Reset Your E7M Password
    </h2>

    <p style="color:#444;font-size:16px;line-height:1.6;">
      We received a request to reset your E7M account password.
    </p>

    <p style="color:#444;font-size:16px;line-height:1.6;">
      Click the button below to create a new password.
    </p>

    <div style="margin:30px 0;">

      <a
        href="${resetUrl}"
        style="
          display:inline-block;
          padding:14px 28px;
          background:#38A935;
          color:#ffffff;
          text-decoration:none;
          border-radius:8px;
          font-weight:bold;
        "
      >
        Reset Password
      </a>

    </div>

    <p style="color:#777;font-size:14px;">
      This link will expire in ${
        process.env.PASSWORD_RESET_EXPIRES_MINUTES || 30
      } minutes.
    </p>

    <p style="color:#777;font-size:14px;">
      If you did not request a password reset, you can safely ignore this email.
    </p>

    <hr
      style="
        border:none;
        border-top:1px solid #eeeeee;
        margin:30px 0;
      "
    >

    <p style="color:#999;font-size:13px;">
      E7M Team
    </p>

  </div>

</body>
</html>
`,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ PASSWORD RESET EMAIL SENT");
    console.log("📧 MESSAGE ID:", info.messageId);
    console.log("📧 RESPONSE:", info.response);

    return info;
  } catch (error) {
    console.error("❌ PASSWORD RESET EMAIL ERROR:", error);

    throw error;
  }
};

// ============================================================
// SEND EMAIL VERIFICATION OTP
// ============================================================

const sendEmailVerificationOtp = async ({ to, otp }) => {
  try {
    console.log("📧 START SENDING EMAIL VERIFICATION OTP");
    console.log("📧 FROM:", process.env.SMTP_FROM);
    console.log("📧 TO:", to);
    console.log("📧 OTP:", otp);

    const mailOptions = {
      from: `"E7M" <${process.env.SMTP_FROM}>`,

      to,

      subject: "Verify Your E7M Email",

      text: `
Hello,

Your E7M verification code is:

${otp}

This code will expire in ${
        process.env.EMAIL_VERIFICATION_OTP_EXPIRES_MINUTES || 10
      } minutes.

If you did not create an E7M account, you can safely ignore this email.

Regards,
E7M Team
`,

      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Verify Your E7M Email</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f7fb;
    font-family:Arial,sans-serif;
  "
>

  <div
    style="
      max-width:600px;
      margin:40px auto;
      background:#ffffff;
      border-radius:12px;
      padding:35px;
      box-sizing:border-box;
    "
  >

    <h2 style="color:#123C88;">
      Verify Your E7M Email
    </h2>

    <p
      style="
        color:#444;
        font-size:16px;
        line-height:1.6;
      "
    >
      Thank you for creating an E7M account.
    </p>

    <p
      style="
        color:#444;
        font-size:16px;
        line-height:1.6;
      "
    >
      Use the verification code below to verify your email address:
    </p>

    <div
      style="
        margin:30px 0;
        text-align:center;
      "
    >

      <div
        style="
          display:inline-block;
          padding:18px 35px;
          background:#38A935;
          color:#ffffff;
          border-radius:10px;
          font-size:30px;
          font-weight:bold;
          letter-spacing:8px;
        "
      >
        ${otp}
      </div>

    </div>

    <p
      style="
        color:#777;
        font-size:14px;
        line-height:1.6;
      "
    >
      This verification code will expire in ${
        process.env.EMAIL_VERIFICATION_OTP_EXPIRES_MINUTES || 10
      } minutes.
    </p>

    <p
      style="
        color:#777;
        font-size:14px;
        line-height:1.6;
      "
    >
      If you did not create an E7M account, you can safely ignore this email.
    </p>

    <hr
      style="
        border:none;
        border-top:1px solid #eeeeee;
        margin:30px 0;
      "
    >

    <p
      style="
        color:#999;
        font-size:13px;
      "
    >
      E7M Team
    </p>

  </div>

</body>
</html>
`,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ EMAIL VERIFICATION OTP SENT");
    console.log("📧 MESSAGE ID:", info.messageId);
    console.log("📧 RESPONSE:", info.response);

    return info;
  } catch (error) {
    console.error("❌ EMAIL VERIFICATION OTP ERROR:", error);

    throw error;
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  transporter,
  verifyEmailConnection,
  sendPasswordResetEmail,
  sendEmailVerificationOtp,
};