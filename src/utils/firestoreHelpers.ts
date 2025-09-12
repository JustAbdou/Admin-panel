import { collection, doc, CollectionReference, DocumentReference, getDoc, setDoc, getDocs, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';

export const getRestaurantCollection = (restaurantId: string, collectionName: string): CollectionReference => {
  return collection(db, 'restaurants', restaurantId, collectionName);
};


export const getRestaurantDoc = (restaurantId: string, collectionName: string, docId: string): DocumentReference => {
  return doc(db, 'restaurants', restaurantId, collectionName, docId);
};


export const getRestaurantReference = (restaurantId: string): DocumentReference => {
  return doc(db, 'restaurants', restaurantId);
};


export const getRecipesCollection = (restaurantId: string): CollectionReference => {
  return getRestaurantCollection(restaurantId, 'recipes');
};


export const getPrepListCollection = (restaurantId: string): CollectionReference => {
  return getRestaurantCollection(restaurantId, 'preplist');
};


export const getOrderListCollection = (restaurantId: string): CollectionReference => {
  return getRestaurantCollection(restaurantId, 'orderlist');
};


export const getClosingListCollection = (restaurantId: string): CollectionReference => {
  return getRestaurantCollection(restaurantId, 'closinglist');
};


export const getInvoicesCollection = (restaurantId: string): CollectionReference => {
  return getRestaurantCollection(restaurantId, 'invoices');
};

export const getDeliveryLogsCollection = (restaurantId: string): CollectionReference => {
  return getRestaurantCollection(restaurantId, 'deliverylogs');
};


export const getFridgeLogsCollection = (restaurantId: string): CollectionReference => {
  return getRestaurantCollection(restaurantId, 'fridgelogs');
};


export const getHandoversCollection = (restaurantId: string): CollectionReference => {
  return getRestaurantCollection(restaurantId, 'handovers');
};


export const getRecipeCategoriesDoc = (restaurantId: string): DocumentReference => {
  return getRestaurantDoc(restaurantId, 'recipes', 'categories');
};


export const getRecipeCategoryCollection = (restaurantId: string, categoryName: string): CollectionReference => {
  return collection(db, 'restaurants', restaurantId, 'recipes', 'categories', categoryName);
};


export const getRecipeInCategoryDoc = (restaurantId: string, categoryName: string, recipeId: string): DocumentReference => {
  return doc(db, 'restaurants', restaurantId, 'recipes', 'categories', categoryName, recipeId);
};


export const checkRestaurantExists = async (restaurantId: string): Promise<boolean> => {
  const restaurantRef = getRestaurantReference(restaurantId);
  const restaurantSnap = await getDoc(restaurantRef);
  return restaurantSnap.exists();
};


export const ensureRestaurantExists = async (
  restaurantId: string, 
  restaurantData?: { name?: string; createdAt?: string; [key: string]: any }
): Promise<boolean> => {
  const restaurantRef = getRestaurantReference(restaurantId);
  const restaurantSnap = await getDoc(restaurantRef);
  
  if (!restaurantSnap.exists()) {
    const defaultData = {
      name: restaurantData?.name || restaurantId,
      createdAt: restaurantData?.createdAt || new Date().toISOString(),
      status: 'active',
      ...restaurantData
    };
    
    await setDoc(restaurantRef, defaultData);
    
    const categoriesRef = getRecipeCategoriesDoc(restaurantId);
    await setDoc(categoriesRef, {
      names: [],
      createdAt: new Date().toISOString()
    });
    
    return true; 
  }
  
  return false; 
};


export const getUsersCollection = (restaurantId: string): CollectionReference => {
  return getRestaurantCollection(restaurantId, 'users');
};


export const getUserDoc = (restaurantId: string, userId: string): DocumentReference => {
  return getRestaurantDoc(restaurantId, 'users', userId);
};


export const getSuppliersDoc = (restaurantId: string): DocumentReference => {
  return getRestaurantDoc(restaurantId, 'suppliers', 'suppliers');
};


export const getSuppliersNames = async (restaurantId: string): Promise<string[]> => {
  const suppliersDoc = getSuppliersDoc(restaurantId);
  const docSnap = await getDoc(suppliersDoc);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    return data.names || [];
  }
  
  return [];
};

export const updateSuppliersNames = async (restaurantId: string, names: string[]): Promise<void> => {
  const suppliersDoc = getSuppliersDoc(restaurantId);
  await setDoc(suppliersDoc, { 
    names,
    updatedAt: new Date().toISOString()
  }, { merge: true });
};


export const getFridgesDoc = (restaurantId: string): DocumentReference => {
  return getRestaurantDoc(restaurantId, 'fridges', 'fridges');
};


export const getFridgesNames = async (restaurantId: string): Promise<string[]> => {
  const fridgesDoc = getFridgesDoc(restaurantId);
  const docSnap = await getDoc(fridgesDoc);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    return data.names || [];
  }
  
  return [];
};


export const updateFridgesNames = async (restaurantId: string, names: string[]): Promise<void> => {
  const fridgesDoc = getFridgesDoc(restaurantId);
  await setDoc(fridgesDoc, { 
    names,
    updatedAt: new Date().toISOString()
  }, { merge: true });
};


export const uploadImageToStorage = async (
  file: File, 
  restaurantId: string, 
  folder: string = 'recipes'
): Promise<string> => {
  try {
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop();
    const fileName = `${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
    
    const storageRef = ref(storage, `${restaurantId}/${folder}/${fileName}`);
    
    const snapshot = await uploadBytes(storageRef, file);
    
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw new Error('Failed to upload image. Please try again.');
  }
};

export const createDeliveryLogDocument = async (
  restaurantId: string, 
  supplierName: string, 
  createdBy: string
): Promise<void> => {
  const deliveryLogsCollection = getDeliveryLogsCollection(restaurantId);
  const docRef = doc(deliveryLogsCollection, supplierName);
  
  await setDoc(docRef, {
    id: docRef.id,
    supplierName,
    date: '',
    frozen: '',
    chilled: '',
    done: false,
    createdBy,
    restaurantId
  });
};

export const createFridgeLogDocument = async (
  restaurantId: string, 
  fridgeName: string, 
  createdBy: string
): Promise<void> => {
  const fridgeLogsCollection = getFridgeLogsCollection(restaurantId);
  const docRef = doc(fridgeLogsCollection, fridgeName);
  
  await setDoc(docRef, {
    id: docRef.id,
    fridgeName,
    date: '',
    temperatureAM: '',
    temperaturePM: '',
    done: false,
    createdBy,
    restaurantId
  });
};

// Get fridge names from fridge logs collection
export const getFridgeNamesFromLogs = async (restaurantId: string): Promise<string[]> => {
  const fridgeLogsCollection = getFridgeLogsCollection(restaurantId);
  const snapshot = await getDocs(fridgeLogsCollection);
  const fridgeNames = snapshot.docs
    .map(doc => doc.data())
    .filter(data => !data.createdAt) // Only items without createdAt field
    .map(data => data.fridgeName);
  return Array.from(new Set(fridgeNames)); // Remove duplicates
};

// Get supplier names from delivery logs collection  
export const getSupplierNamesFromLogs = async (restaurantId: string): Promise<string[]> => {
  const deliveryLogsCollection = getDeliveryLogsCollection(restaurantId);
  const snapshot = await getDocs(deliveryLogsCollection);
  const supplierNames = snapshot.docs
    .map(doc => doc.data())
    .filter(data => !data.createdAt) // Only items without createdAt field
    .map(data => data.supplierName);
  return Array.from(new Set(supplierNames)); // Remove duplicates
};

// Delete fridge log document
export const deleteFridgeLogDocument = async (
  restaurantId: string, 
  fridgeName: string
): Promise<void> => {
  const fridgeLogsCollection = getFridgeLogsCollection(restaurantId);
  const docRef = doc(fridgeLogsCollection, fridgeName);
  await deleteDoc(docRef);
};

// Delete delivery log document
export const deleteDeliveryLogDocument = async (
  restaurantId: string, 
  supplierName: string
): Promise<void> => {
  const deliveryLogsCollection = getDeliveryLogsCollection(restaurantId);
  const docRef = doc(deliveryLogsCollection, supplierName);
  await deleteDoc(docRef);
};
