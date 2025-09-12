"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetClosingChecklistManual = exports.resetClosingChecklistDaily = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
/**
 * Scheduled function to reset closing checklist items every day at 3AM GMT+1
 * This function runs at 2:00 AM UTC which corresponds to 3:00 AM GMT+1
 */
exports.resetClosingChecklistDaily = functions.pubsub.schedule("0 2 * * *")
    .timeZone("Europe/Paris") // GMT+1 timezone
    .onRun(async (context) => {
    console.log("Starting daily reset of closing checklist items");
    const db = admin.firestore();
    try {
        // Get all restaurants
        const restaurantsSnapshot = await db.collection("restaurants").get();
        let totalUpdatedItems = 0;
        // Process each restaurant
        for (const restaurantDoc of restaurantsSnapshot.docs) {
            const restaurantId = restaurantDoc.id;
            console.log(`Processing restaurant: ${restaurantId}`);
            // Get all closing checklist items for this restaurant
            const closingItemsRef = db.collection("restaurants")
                .doc(restaurantId)
                .collection("closinglist");
            const closingItemsSnapshot = await closingItemsRef
                .where("done", "==", true)
                .get();
            console.log(`Found ${closingItemsSnapshot.size} completed items for restaurant ${restaurantId}`);
            // Reset all completed items to not done
            const batch = db.batch();
            closingItemsSnapshot.docs.forEach((doc) => {
                batch.update(doc.ref, {
                    done: false
                });
            });
            if (closingItemsSnapshot.size > 0) {
                await batch.commit();
                totalUpdatedItems += closingItemsSnapshot.size;
                console.log(`Reset ${closingItemsSnapshot.size} items for restaurant ${restaurantId}`);
            }
        }
        console.log(`Daily reset completed successfully. Total items reset: ${totalUpdatedItems}`);
        // Log the reset activity to a separate collection for tracking
        await db.collection("system_logs").add({
            action: "daily_closing_reset",
            timestamp: new Date(),
            totalRestaurants: restaurantsSnapshot.size,
            totalItemsReset: totalUpdatedItems,
            executedAt: "3AM_GMT+1",
            success: true
        });
        return null;
    }
    catch (error) {
        console.error("Error during daily reset:", error);
        // Log the error
        await db.collection("system_logs").add({
            action: "daily_closing_reset",
            timestamp: new Date(),
            error: error.message,
            success: false
        });
        throw error;
    }
});
/**
 * HTTP function for manual reset (can be called via HTTP request)
 * Useful for testing or manual resets
 */
exports.resetClosingChecklistManual = functions.https.onRequest(async (req, res) => {
    console.log("Manual reset of closing checklist items triggered");
    const db = admin.firestore();
    try {
        // Get all restaurants
        const restaurantsSnapshot = await db.collection("restaurants").get();
        let totalUpdatedItems = 0;
        for (const restaurantDoc of restaurantsSnapshot.docs) {
            const restaurantId = restaurantDoc.id;
            const closingItemsRef = db.collection("restaurants")
                .doc(restaurantId)
                .collection("closinglist");
            const closingItemsSnapshot = await closingItemsRef
                .where("done", "==", true)
                .get();
            const batch = db.batch();
            closingItemsSnapshot.docs.forEach((doc) => {
                batch.update(doc.ref, {
                    done: false
                });
            });
            if (closingItemsSnapshot.size > 0) {
                await batch.commit();
                totalUpdatedItems += closingItemsSnapshot.size;
            }
        }
        console.log(`Manual reset completed. Total items reset: ${totalUpdatedItems}`);
        // Log the manual reset
        await db.collection("system_logs").add({
            action: "manual_closing_reset",
            timestamp: new Date(),
            totalRestaurants: restaurantsSnapshot.size,
            totalItemsReset: totalUpdatedItems,
            triggeredBy: "http_request",
            success: true
        });
        res.json({
            success: true,
            totalItemsReset: totalUpdatedItems,
            message: `Successfully reset ${totalUpdatedItems} closing checklist items across all restaurants.`
        });
    }
    catch (error) {
        console.error("Error during manual reset:", error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
//# sourceMappingURL=index.js.map