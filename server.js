// server.js
import express from "express";
import next from "next";
import Razorpay from "razorpay";
import bodyParser from "body-parser";
import crypto from "crypto";
import dotenv from "dotenv";
import cors from "cors";
dotenv.config();
console.log(
  "Environment Variables:",
  process.env.RAZORPAY_KEY_ID,
  process.env.RAZORPAY_KEY_SECRET
);
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Razorpay configuration
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Middleware
app.use(bodyParser.json());

// API routes for Razorpay integration

// Create subscription
app.post("/api/create-subscription", async (req, res) => {
  try {
    const { plan_id, customer_details } = req.body;

    if (!plan_id || !customer_details?.email || !customer_details?.name) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: plan_id, email, or name",
      });
    }

    if (!/^\S+@\S+\.\S+$/.test(customer_details.email)) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format",
      });
    }

    let customer;
    try {
      const customers = await razorpay.customers.all({
        email: customer_details.email,
        count: 1,
      });

      customer = customers.items[0];
      if (!customer) {
        customer = await razorpay.customers.create({
          name: customer_details.name,
          email: customer_details.email,
          contact: customer_details.phone || "0000000000",
        });
      }
    } catch (customerError) {
      console.error("Customer management error:", customerError);
      return res.status(500).json({
        success: false,
        error: customerError.error?.description || "Customer management failed",
      });
    }

    const plan = await razorpay.plans.fetch(plan_id);
    console.log("Plan details:", plan);
    console.log("Customer details:", customer);

    let total_count;
    console.log("Plan period:", plan.period);
    if (plan.period === "monthly") {
      total_count = 12;
    } else if (plan.period === "yearly") {
      total_count = 1;
    } else {
      return res.status(400).json({ error: "Unsupported billing interval" });
    }

    const subscription = await razorpay.subscriptions.create({
      plan_id,
      customer_notify: 1,
      total_count,
      customer_id: customer.id, // Reference customer ID instead of sending full details
    });

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        plan_id: subscription.plan_id,
        status: subscription.status,
      },
    });
  } catch (error) {
    console.error("Subscription error:", error);
    res.status(500).json({
      success: false,
      error: error.error?.description || "Subscription creation failed",
    });
  }
});
//Verify payment
app.post("/api/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
    } = req.body;

    // For one-time payments
    if (razorpay_payment_id && !razorpay_subscription_id) {
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      if (payment.status === "captured" || payment.status === "authorized") {
        return res.status(200).json({ success: true, payment });
      }
      return res
        .status(400)
        .json({ success: false, message: "Payment verification failed" });
    }

    // For subscription payments
    if (razorpay_subscription_id) {
      // Construct signature verification data
      const generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_payment_id}|${razorpay_subscription_id}`)
        .digest("hex");

      // Verify signature
      if (generatedSignature === razorpay_signature) {
        return res.status(200).json({ success: true });
      }
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    res
      .status(400)
      .json({ success: false, message: "Missing required parameters" });
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Payment verification failed",
    });
  }
});

// Razorpay webhook endpoint
app.post("/api/razorpay-webhook", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];

    // Validate webhook signature
    if (!validateWebhookSignature(req.body, signature)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    const { event, payload } = req.body;

    // Process different webhook events
    switch (event) {
      case "payment.authorized":
        // Handle successful payment
        console.log("Payment authorized:", payload.payment.entity.id);
        // Update your database or send confirmation email
        break;

      case "payment.failed":
        // Handle failed payment
        console.log("Payment failed:", payload.payment.entity.id);
        // Notify user or update records
        break;

      case "subscription.activated":
        // Handle new subscription
        console.log("Subscription activated:", payload.subscription.entity.id);
        // Set up subscription in your database
        break;

      case "subscription.halted":
      case "subscription.cancelled":
        // Handle subscription cancellation
        console.log("Subscription ended:", payload.subscription.entity.id);
        // Update subscription status in your database
        break;
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Still return 200 to prevent retries
    res.status(200).json({ success: true });
  }
});

// Fetch donation statistics
app.get("/api/donation-stats", async (req, res) => {
  try {
    // Ideally, you'd retrieve this from your database
    // This is a placeholder
    const stats = {
      totalRaised: 127500,
      donorsCount: 43,
      projectsSupported: 5,
      recentDonations: [
        { name: "Rahul S.", amount: 2000, date: "2025-05-15" },
        { name: "Priya M.", amount: 3500, date: "2025-05-14" },
        { name: "Anil K.", amount: 200, date: "2025-05-14" },
        { name: "Sunita R.", amount: 5000, date: "2025-05-12" },
      ],
    };

    res.status(200).json({ success: true, stats });
  } catch (error) {
    console.error("Stats retrieval error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to retrieve donation statistics",
    });
  }
});

// Generate donation receipt
app.get("/api/generate-receipt/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Fetch payment details from Razorpay
    const payment = await razorpay.payments.fetch(paymentId);

    // Generate receipt data
    // You'd typically use a PDF generation library here
    const receiptData = {
      receiptNumber: `RCP-${Date.now().toString().slice(-6)}`,
      paymentId: payment.id,
      amount: payment.amount / 100,
      currency: payment.currency,
      donorName: payment.notes?.name || "Donor",
      donorEmail: payment.notes?.email || "Not provided",
      donationType: payment.notes?.donation_type || "Donation",
      date: new Date(payment.created_at * 1000).toISOString(),
      pan: payment.notes?.pan || "Not provided",
    };

    // In a real implementation, you'd generate and return a PDF
    // For now, we'll return the receipt data
    res.status(200).json({
      success: true,
      receipt: receiptData,
    });
  } catch (error) {
    console.error("Receipt generation error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to generate receipt",
    });
  }
});

// Default request handler to Next.js
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, (err) => {
  if (err) throw err;
  console.log(`> Server ready on http://localhost:${PORT}`);
});
