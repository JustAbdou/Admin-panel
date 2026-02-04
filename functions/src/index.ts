import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

/**
 * Scheduled function to reset closing and opening checklist items every day at 3AM GMT+1
 * This function runs at 2:00 AM UTC which corresponds to 3:00 AM GMT+1
 */
export const resetChecklistsDaily = functions.pubsub.schedule("0 2 * * *")
  .timeZone("Europe/Paris") // GMT+1 timezone
  .onRun(async (context) => {
    console.log("Starting daily reset of closing and opening checklist items");

    const db = admin.firestore();

    try {
      // Get all restaurants
      const restaurantsSnapshot = await db.collection("restaurants").get();

      let totalClosingItemsReset = 0;
      let totalOpeningItemsReset = 0;

      // Process each restaurant
      for (const restaurantDoc of restaurantsSnapshot.docs) {
        const restaurantId = restaurantDoc.id;

        console.log(`Processing restaurant: ${restaurantId}`);

        // Reset CLOSING checklist items
        const closingItemsRef = db.collection("restaurants")
          .doc(restaurantId)
          .collection("closinglist");

        const closingItemsSnapshot = await closingItemsRef
          .where("done", "==", true)
          .get();

        console.log(`Found ${closingItemsSnapshot.size} completed closing items for restaurant ${restaurantId}`);

        if (closingItemsSnapshot.size > 0) {
          const closingBatch = db.batch();

          closingItemsSnapshot.docs.forEach((doc) => {
            closingBatch.update(doc.ref, {
              done: false
            });
          });

          await closingBatch.commit();
          totalClosingItemsReset += closingItemsSnapshot.size;
          console.log(`Reset ${closingItemsSnapshot.size} closing items for restaurant ${restaurantId}`);
        }

        // Reset OPENING checklist items
        const openingItemsRef = db.collection("restaurants")
          .doc(restaurantId)
          .collection("openinglist");

        const openingItemsSnapshot = await openingItemsRef
          .where("done", "==", true)
          .get();

        console.log(`Found ${openingItemsSnapshot.size} completed opening items for restaurant ${restaurantId}`);

        if (openingItemsSnapshot.size > 0) {
          const openingBatch = db.batch();

          openingItemsSnapshot.docs.forEach((doc) => {
            openingBatch.update(doc.ref, {
              done: false
            });
          });

          await openingBatch.commit();
          totalOpeningItemsReset += openingItemsSnapshot.size;
          console.log(`Reset ${openingItemsSnapshot.size} opening items for restaurant ${restaurantId}`);
        }
      }

      const totalItems = totalClosingItemsReset + totalOpeningItemsReset;
      console.log(`Daily reset completed successfully. Closing: ${totalClosingItemsReset}, Opening: ${totalOpeningItemsReset}, Total: ${totalItems}`);

      // Log the reset activity to a separate collection for tracking
      await db.collection("system_logs").add({
        action: "daily_checklists_reset",
        timestamp: new Date(),
        totalRestaurants: restaurantsSnapshot.size,
        totalClosingItemsReset: totalClosingItemsReset,
        totalOpeningItemsReset: totalOpeningItemsReset,
        totalItemsReset: totalItems,
        executedAt: "3AM_GMT+1",
        success: true
      });

      return null;

    } catch (error: any) {
      console.error("Error during daily reset:", error);

      // Log the error
      await db.collection("system_logs").add({
        action: "daily_checklists_reset",
        timestamp: new Date(),
        error: error.message,
        success: false
      });

      throw error;
    }
  });

/**
 * Scheduled function to reset opening checklist items every day at 3AM GMT+1
 * This function runs at 2:00 AM UTC which corresponds to 3:00 AM GMT+1
 */
export const resetOpeningChecklistDaily = functions.pubsub.schedule("0 2 * * *")
  .timeZone("Europe/Paris") // GMT+1 timezone
  .onRun(async (context) => {
    console.log("Starting daily reset of opening checklist items");
    
    const db = admin.firestore();
    
    try {
      // Get all restaurants
      const restaurantsSnapshot = await db.collection("restaurants").get();
      
      let totalUpdatedItems = 0;
      
      // Process each restaurant
      for (const restaurantDoc of restaurantsSnapshot.docs) {
        const restaurantId = restaurantDoc.id;
        
        console.log(`Processing restaurant: ${restaurantId}`);
        
        // Get all opening checklist items for this restaurant
        const openingItemsRef = db.collection("restaurants")
          .doc(restaurantId)
          .collection("openinglist");
        
        const openingItemsSnapshot = await openingItemsRef
          .where("done", "==", true)
          .get();
        
        console.log(`Found ${openingItemsSnapshot.size} completed items for restaurant ${restaurantId}`);
        
        // Reset all completed items to not done
        const batch = db.batch();
        
        openingItemsSnapshot.docs.forEach((doc) => {
          batch.update(doc.ref, {
            done: false
          });
        });
        
        if (openingItemsSnapshot.size > 0) {
          await batch.commit();
          totalUpdatedItems += openingItemsSnapshot.size;
          console.log(`Reset ${openingItemsSnapshot.size} items for restaurant ${restaurantId}`);
        }
      }
      
      console.log(`Daily reset completed successfully. Total items reset: ${totalUpdatedItems}`);
      
      // Log the reset activity to a separate collection for tracking
      await db.collection("system_logs").add({
        action: "daily_opening_reset",
        timestamp: new Date(),
        totalRestaurants: restaurantsSnapshot.size,
        totalItemsReset: totalUpdatedItems,
        executedAt: "3AM_GMT+1",
        success: true
      });
      
      return null;
      
    } catch (error: any) {
      console.error("Error during daily reset:", error);
      
      // Log the error
      await db.collection("system_logs").add({
        action: "daily_opening_reset",
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
export const resetChecklistsManual = functions.https.onRequest(async (req, res) => {
  console.log("Manual reset of closing and opening checklist items triggered");

  const db = admin.firestore();

  try {
    // Get all restaurants
    const restaurantsSnapshot = await db.collection("restaurants").get();

    let totalClosingItemsReset = 0;
    let totalOpeningItemsReset = 0;

    for (const restaurantDoc of restaurantsSnapshot.docs) {
      const restaurantId = restaurantDoc.id;

      // Reset CLOSING checklist
      const closingItemsRef = db.collection("restaurants")
        .doc(restaurantId)
        .collection("closinglist");

      const closingItemsSnapshot = await closingItemsRef
        .where("done", "==", true)
        .get();

      if (closingItemsSnapshot.size > 0) {
        const closingBatch = db.batch();

        closingItemsSnapshot.docs.forEach((doc) => {
          closingBatch.update(doc.ref, {
            done: false
          });
        });

        await closingBatch.commit();
        totalClosingItemsReset += closingItemsSnapshot.size;
      }

      // Reset OPENING checklist
      const openingItemsRef = db.collection("restaurants")
        .doc(restaurantId)
        .collection("openinglist");

      const openingItemsSnapshot = await openingItemsRef
        .where("done", "==", true)
        .get();

      if (openingItemsSnapshot.size > 0) {
        const openingBatch = db.batch();

        openingItemsSnapshot.docs.forEach((doc) => {
          openingBatch.update(doc.ref, {
            done: false
          });
        });

        await openingBatch.commit();
        totalOpeningItemsReset += openingItemsSnapshot.size;
      }
    }

    const totalItems = totalClosingItemsReset + totalOpeningItemsReset;
    console.log(`Manual reset completed. Closing: ${totalClosingItemsReset}, Opening: ${totalOpeningItemsReset}, Total: ${totalItems}`);

    // Log the manual reset
    await db.collection("system_logs").add({
      action: "manual_checklists_reset",
      timestamp: new Date(),
      totalRestaurants: restaurantsSnapshot.size,
      totalClosingItemsReset: totalClosingItemsReset,
      totalOpeningItemsReset: totalOpeningItemsReset,
      totalItemsReset: totalItems,
      triggeredBy: "http_request",
      success: true
    });

    res.json({
      success: true,
      totalClosingItemsReset: totalClosingItemsReset,
      totalOpeningItemsReset: totalOpeningItemsReset,
      totalItemsReset: totalItems,
      message: `Successfully reset ${totalItems} checklist items (${totalClosingItemsReset} closing, ${totalOpeningItemsReset} opening) across all restaurants.`
    });

  } catch (error: any) {
    console.error("Error during manual reset:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * HTTP function for manual reset of opening checklist (can be called via HTTP request)
 * Useful for testing or manual resets
 */
export const resetOpeningChecklistManual = functions.https.onRequest(async (req, res) => {
  console.log("Manual reset of opening checklist items triggered");
  
  const db = admin.firestore();
  
  try {
    // Get all restaurants
    const restaurantsSnapshot = await db.collection("restaurants").get();
    
    let totalUpdatedItems = 0;
    
    for (const restaurantDoc of restaurantsSnapshot.docs) {
      const restaurantId = restaurantDoc.id;
      
      const openingItemsRef = db.collection("restaurants")
        .doc(restaurantId)
        .collection("openinglist");
      
      const openingItemsSnapshot = await openingItemsRef
        .where("done", "==", true)
        .get();
      
      const batch = db.batch();
      
      openingItemsSnapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          done: false
        });
      });
      
      if (openingItemsSnapshot.size > 0) {
        await batch.commit();
        totalUpdatedItems += openingItemsSnapshot.size;
      }
    }
    
    console.log(`Manual reset completed. Total items reset: ${totalUpdatedItems}`);
    
    // Log the manual reset
    await db.collection("system_logs").add({
      action: "manual_opening_reset",
      timestamp: new Date(),
      totalRestaurants: restaurantsSnapshot.size,
      totalItemsReset: totalUpdatedItems,
      triggeredBy: "http_request",
      success: true
    });
    
    res.json({ 
      success: true, 
      totalItemsReset: totalUpdatedItems,
      message: `Successfully reset ${totalUpdatedItems} opening checklist items across all restaurants.`
    });
    
  } catch (error: any) {
    console.error("Error during manual reset:", error);
    
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});
