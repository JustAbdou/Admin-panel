import React, { useState, useEffect } from 'react';
import {
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { useRestaurant } from '../../contexts/RestaurantContext';
import {
  getRecipeCategoriesDoc,
  getRecipeCategoryCollection,
  getRecipeInCategoryDoc,
  uploadImageToStorage
} from '../../utils/firestoreHelpers';
import Layout from '../layout/Layout';

// Recipe cache management
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

interface CacheData {
  recipes: Recipe[];
  categories: Category[] | string[]; // Support both old (string[]) and new (Category[]) formats
  timestamp: number;
  restaurantId: string; // Add restaurantId to cache
}

// Cache utility functions
const getCachedData = (restaurantId: string): CacheData | null => {
  try {
    const CACHE_KEY = `recipes_cache_${restaurantId}`;
    const CACHE_EXPIRY_KEY = `recipes_cache_expiry_${restaurantId}`;

    const cachedData = localStorage.getItem(CACHE_KEY);
    const cacheExpiry = localStorage.getItem(CACHE_EXPIRY_KEY);

    if (!cachedData || !cacheExpiry) return null;

    const expiryTime = parseInt(cacheExpiry);
    if (Date.now() > expiryTime) {
      // Cache expired, clean it up
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_EXPIRY_KEY);
      return null;
    }

    const parsedData = JSON.parse(cachedData);

    // Verify the cache is for the correct restaurant
    if (parsedData.restaurantId !== restaurantId) {
      return null;
    }

    return parsedData;
  } catch (error) {
    console.warn('Error reading cache:', error);
    return null;
  }
};

const setCachedData = (data: CacheData, restaurantId: string): void => {
  try {
    const CACHE_KEY = `recipes_cache_${restaurantId}`;
    const CACHE_EXPIRY_KEY = `recipes_cache_expiry_${restaurantId}`;

    const expiryTime = Date.now() + CACHE_DURATION;
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_EXPIRY_KEY, expiryTime.toString());
    console.log(`📱 Recipes cached successfully for restaurant: ${restaurantId}`);
  } catch (error) {
    console.warn('Error setting cache:', error);
  }
};

const clearCache = (restaurantId: string): void => {
  const CACHE_KEY = `recipes_cache_${restaurantId}`;
  const CACHE_EXPIRY_KEY = `recipes_cache_expiry_${restaurantId}`;

  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(CACHE_EXPIRY_KEY);
  console.log(`🧹 Recipe cache cleared for restaurant: ${restaurantId}`);
};

// Image compression utility
const compressImage = (file: File, maxWidth: number = 800, quality: number = 0.8): Promise<File> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      
      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width = (width * maxWidth) / height;
          height = maxWidth;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx?.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg', // Convert to JPEG for better compression
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            resolve(file); // Fallback to original if compression fails
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.src = URL.createObjectURL(file);
  });
};

interface Recipe {
  id: string;
  category: string;
  createdAt: string;
  image: string | string[]; // Backwards compatible: string for old recipes, string[] for new multi-image recipes
  ingredients: string[];
  instructions: string[];
  notes: string;
  recipeName: string;
  archived?: boolean; // Default false if missing
  archivedAt?: Timestamp | null;
  archivedBy?: string | null;
}

interface Category {
  name: string;
  archived?: boolean; // Default false if missing
  archivedAt?: Timestamp | null;
  archivedBy?: string | null;
}

interface RecipeFormData {
  category: string;
  image: string[]; // Internal form data always uses array for consistent handling
  ingredients: string[];
  instructions: string[];
  notes: string;
  recipeName: string;
}

const Recipes: React.FC = () => {
  const { restaurantId, availableRestaurants, user } = useRestaurant();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [categoryTab, setCategoryTab] = useState<'active' | 'archived'>('active');
  const [formData, setFormData] = useState<RecipeFormData>({
    category: '',
    image: [], // Keep as array internally for multiple images
    ingredients: [''],
    instructions: [''],
    notes: '',
    recipeName: '',
  });
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const [showManageCategoriesModal, setShowManageCategoriesModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]); // Changed from selectedFile to selectedFiles array
  const [uploading, setUploading] = useState(false);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]); // Track actual Firebase URLs separately
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewingRecipe, setViewingRecipe] = useState<Recipe | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [printingAll, setPrintingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');

  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null);
  const [editingCategoryIndex, setEditingCategoryIndex] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState<string>('');

  // Import/Export states
  const [exporting, setExporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [isLoadingFromCache, setIsLoadingFromCache] = useState(false);

  // Copy to venues state
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([]);

  // Helper functions for drag and drop
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedImageIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedImageIndex === null || draggedImageIndex === dropIndex) return;
    
    // Handle reordering within existing images
    if (draggedImageIndex < existingImageUrls.length && dropIndex < existingImageUrls.length) {
      const newExistingImages = [...existingImageUrls];
      const [draggedImage] = newExistingImages.splice(draggedImageIndex, 1);
      newExistingImages.splice(dropIndex, 0, draggedImage);
      setExistingImageUrls(newExistingImages);
      setFormData(prev => ({ ...prev, image: newExistingImages }));
    }
    // Handle reordering within new files
    else if (draggedImageIndex >= existingImageUrls.length && dropIndex >= existingImageUrls.length) {
      const newFilesIndex = draggedImageIndex - existingImageUrls.length;
      const dropFilesIndex = dropIndex - existingImageUrls.length;
      const newFiles = [...selectedFiles];
      const [draggedFile] = newFiles.splice(newFilesIndex, 1);
      newFiles.splice(dropFilesIndex, 0, draggedFile);
      setSelectedFiles(newFiles);
    }
    // Handle moving between existing and new (more complex, for now we'll keep them separate)
    
    setDraggedImageIndex(null);
  };

  // Default recipe image
  const getDefaultRecipeImage = () => {
    return `data:image/svg+xml,${encodeURIComponent(`
      <svg width="300" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="300" height="200" fill="#f8fafc"/>
        
        <!-- Plate -->
        <ellipse cx="150" cy="120" rx="60" ry="15" fill="#e2e8f0"/>
        <ellipse cx="150" cy="115" rx="55" ry="13" fill="#f1f5f9"/>
        
        <!-- Food items on plate -->
        <!-- Main dish (chicken/meat) -->
        <ellipse cx="135" cy="110" rx="18" ry="12" fill="#d97706"/>
        <ellipse cx="135" cy="108" rx="15" ry="10" fill="#f59e0b"/>
        
        <!-- Vegetables -->
        <circle cx="165" cy="108" r="8" fill="#16a34a"/>
        <circle cx="175" cy="112" r="6" fill="#22c55e"/>
        <circle cx="155" cy="118" r="5" fill="#dc2626"/>
        <circle cx="145" cy="120" r="4" fill="#ea580c"/>
        
        <!-- Fork on the left -->
        <line x1="80" y1="90" x2="80" y2="130" stroke="#64748b" stroke-width="2"/>
        <line x1="77" y1="92" x2="83" y2="92" stroke="#64748b" stroke-width="1"/>
        <line x1="77" y1="95" x2="83" y2="95" stroke="#64748b" stroke-width="1"/>
        <line x1="77" y1="98" x2="83" y2="98" stroke="#64748b" stroke-width="1"/>
        
        <!-- Knife on the right -->
        <line x1="220" y1="90" x2="220" y2="130" stroke="#64748b" stroke-width="2"/>
        <rect x="218" y="90" width="4" height="12" fill="#94a3b8"/>
        
        <!-- Chef hat decoration -->
        <ellipse cx="150" cy="45" rx="25" ry="15" fill="#ffffff"/>
        <rect x="135" y="45" width="30" height="20" fill="#ffffff"/>
        <ellipse cx="150" cy="65" rx="25" ry="8" fill="#f1f5f9"/>
        
        <text x="150" y="160" text-anchor="middle" fill="#64748b" font-family="Arial, sans-serif" font-size="16" font-weight="500">Recipe Image</text>
        <text x="150" y="175" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif" font-size="12">Click to add your own</text>
      </svg>
    `)}`;
  };

  useEffect(() => {
    if (!restaurantId) return;

    // Try to load from cache first
    const cachedData = getCachedData(restaurantId);
    if (cachedData && cachedData.categories.length > 0) {
      console.log(`📱 Loading categories from cache for restaurant: ${restaurantId}`);
      setIsLoadingFromCache(true);
      // Convert old format (string[]) to new format (Category[]) if needed
      const cachedCategories: Category[] = cachedData.categories.map((cat: any) => 
        typeof cat === 'string' 
          ? { name: cat, archived: false, archivedAt: null, archivedBy: null }
          : {
              name: cat.name || cat,
              archived: cat.archived === true, // Ensure boolean conversion
              archivedAt: cat.archivedAt || null,
              archivedBy: cat.archivedBy || null,
            }
      );
      setCategories(cachedCategories);
      setRecipes(cachedData.recipes);
      setLoading(false);
      // Show cache indicator briefly
      setTimeout(() => setIsLoadingFromCache(false), 2000);
    }

    // Set up real-time listener for categories (will override cache if data changes)
    const categoriesDocRef = getRecipeCategoriesDoc(restaurantId);
    const unsubscribe = onSnapshot(
      categoriesDocRef,
      (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          
          // Handle both old format (names: string[]) and new format (categories: Category[])
          if (data.categories && Array.isArray(data.categories)) {
            // New format with Category objects
            const loadedCategories: Category[] = data.categories.map((cat: any) => ({
              name: cat.name || cat,
              archived: cat.archived === true, // Explicitly check for true
              archivedAt: cat.archivedAt || null,
              archivedBy: cat.archivedBy || null,
            }));
            setCategories(loadedCategories);
            
            // Update cache with latest data
            const currentCache = getCachedData(restaurantId);
            if (currentCache) {
              setCachedData(
                {
                  ...currentCache,
                  categories: loadedCategories,
                },
                restaurantId
              );
            }
          } else if (data.names && Array.isArray(data.names)) {
            // Old format - convert to Category objects
            const categoryObjects: Category[] = data.names.map((name: string) => ({
              name,
              archived: false,
              archivedAt: null,
              archivedBy: null,
            }));
            setCategories(categoryObjects);
            
            // Migrate to new format
            setDoc(categoriesDocRef, {
              categories: categoryObjects,
              names: data.names, // Keep for backward compatibility
            }, { merge: true });
          } else {
            setCategories([]);
          }
        } else {
          setCategories([]);
        }
        setLoading(false);
        setIsLoadingFromCache(false);
      },
      (error) => {
        console.error('Error in categories real-time listener:', error);
        setLoading(false);
        setIsLoadingFromCache(false);
      }
    );

    // Cleanup function
    return () => {
      unsubscribe();
    };
  }, [restaurantId]);

  // Helper functions for categories
  const getActiveCategories = (): Category[] => {
    return categories.filter(cat => {
      // Explicitly check: only return false if archived is explicitly true
      return cat.archived !== true;
    });
  };

  const getArchivedCategories = (): Category[] => {
    return categories.filter(cat => {
      // Explicitly check: only return true if archived is explicitly true
      return cat.archived === true;
    });
  };

  const getCategoryNames = (cats: Category[] = categories): string[] => {
    return cats.map(cat => cat.name);
  };

  const getCategoryByName = (name: string): Category | undefined => {
    return categories.find(cat => cat.name === name);
  };

  const isCategoryArchived = (categoryName: string): boolean => {
    const category = getCategoryByName(categoryName);
    return category?.archived === true;
  };

  // Get categories based on active tab
  const getDisplayCategories = (): Category[] => {
    return categoryTab === 'archived' ? getArchivedCategories() : getActiveCategories();
  };

  useEffect(() => {
    if (!restaurantId) return;

    // If no categories, just set empty recipes and we're done
    if (categories.length === 0) {
      setRecipes([]);
      setLoading(false);
      return;
    }

    console.log(`🔥 Setting up real-time listeners for recipes (${activeTab}) for restaurant: ${restaurantId}`);
    
    const unsubscribeFunctions: (() => void)[] = [];
    const initializedCategories = new Set<string>();

    // Set up real-time listeners for each category
    for (const categoryObj of categories) {
      const categoryName = categoryObj.name;
      try {
        // Query all recipes and filter client-side to handle missing archived field
        // This ensures recipes without archived field (treated as false) are included in active tab
        const categoryQuery = query(
          getRecipeCategoryCollection(restaurantId, categoryName),
          orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(
          categoryQuery,
          (snapshot) => {
            const categoryRecipes = snapshot.docs.map((doc: any) => {
              const data = doc.data();
              // Handle backwards compatibility: ensure image is always array for display
              let imageArray: string[] = [];
              if (Array.isArray(data.image)) {
                imageArray = data.image;
              } else if (typeof data.image === 'string' && data.image) {
                imageArray = [data.image];
              }

              // Handle archived field: default to false if missing (as per requirements)
              const archived = data.archived === true;

              return {
                id: doc.id,
                ...data,
                image: imageArray, // Convert to array for internal use
                archived: archived,
                archivedAt: data.archivedAt || null,
                archivedBy: data.archivedBy || null,
              } as Recipe;
            });

            // Filter by archived status based on active tab
            const filteredRecipes = categoryRecipes.filter(recipe => {
              const recipeArchived = recipe.archived === true;
              const categoryArchived = isCategoryArchived(recipe.category);
              
              if (activeTab === 'archived') {
                // Archived tab: show recipes that are archived OR recipes from archived categories
                return recipeArchived || categoryArchived;
              } else {
                // Active tab: show recipes that are not archived AND not from archived categories
                return !recipeArchived && !categoryArchived;
              }
            });

            // Update recipes for this category
            setRecipes(prev => {
              // Remove old recipes from this category
              const filtered = prev.filter(r => r.category !== categoryName);
              // Add new filtered recipes from this category
              return [...filtered, ...filteredRecipes];
            });

            // Track initialized categories to set loading to false when all are initialized
            if (!initializedCategories.has(categoryName)) {
              initializedCategories.add(categoryName);
              if (initializedCategories.size === categories.length) {
                setLoading(false);
              }
            }
          },
          (error) => {
            console.error(`Error in real-time listener for category ${categoryName}:`, error);
            setLoading(false);
          }
        );

        unsubscribeFunctions.push(unsubscribe);
      } catch (error) {
        console.error(`Error setting up listener for category ${categoryName}:`, error);
        setLoading(false);
      }
    }

    // Cleanup function
    return () => {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }, [restaurantId, categories, activeTab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !formData.category) return;

    try {
      setUploading(true);

      // Start with existing Firebase URLs (for editing)
      let finalImageUrls: string[] = [...existingImageUrls];

      // Upload new files with compression and add their URLs
      if (selectedFiles.length > 0) {
        console.log('Compressing and uploading images...');

        // Compress all images first
        const compressionPromises = selectedFiles.map(async (file) => {
          try {
            const compressedFile = await compressImage(file, 800, 0.8); // Max 800px width, 80% quality
            console.log(`Compressed ${file.name}: ${(file.size / 1024).toFixed(1)}KB → ${(compressedFile.size / 1024).toFixed(1)}KB`);
            return compressedFile;
          } catch (error) {
            console.warn(`Failed to compress ${file.name}, using original:`, error);
            return file; // Fallback to original file if compression fails
          }
        });

        const compressedFiles = await Promise.all(compressionPromises);

        // Upload compressed files
        const uploadPromises = compressedFiles.map(file =>
          uploadImageToStorage(file, restaurantId, 'recipes')
        );
        const newImageUrls = await Promise.all(uploadPromises);

        // Add new uploaded URLs to existing ones (up to 5 total)
        finalImageUrls = [...finalImageUrls, ...newImageUrls].slice(0, 8);
      }

      // If no images at all, add default image
      if (finalImageUrls.length === 0) {
        finalImageUrls = [getDefaultRecipeImage()];
      }

      const recipeData = {
        category: formData.category,
        image: finalImageUrls, // Save as array in the image field for backwards compatibility
        ingredients: formData.ingredients.filter(ing => ing.trim() !== ''),
        instructions: formData.instructions.filter(inst => inst.trim() !== ''),
        notes: formData.notes,
        recipeName: formData.recipeName,
        createdAt: new Date().toISOString(),
        archived: false, // New recipes are not archived by default
        archivedAt: null,
        archivedBy: null,
      };

      if (editingRecipe) {
        // Preserve archived status when editing
        const preservedArchivedData = {
          ...recipeData,
          archived: editingRecipe.archived === true,
          archivedAt: editingRecipe.archivedAt || null,
          archivedBy: editingRecipe.archivedBy || null,
        };
        
        // If category changed, we need to delete from old category and create in new category
        if (editingRecipe.category !== formData.category) {
          // Delete from old category
          await deleteDoc(getRecipeInCategoryDoc(restaurantId, editingRecipe.category, editingRecipe.id));
          // Create in new category with preserved archived status
          await addDoc(getRecipeCategoryCollection(restaurantId, formData.category), preservedArchivedData);
        } else {
          // Update in same category (preserve archived status)
          await updateDoc(
            getRecipeInCategoryDoc(restaurantId, formData.category, editingRecipe.id),
            preservedArchivedData
          );
        }
      } else {
        // Add to current restaurant (new recipe, not archived)
        await addDoc(getRecipeCategoryCollection(restaurantId, formData.category), recipeData);
      }

      // Copy to selected additional restaurants (if any selected)
      if (selectedRestaurantIds.length > 0) {
        for (const targetRestaurantId of selectedRestaurantIds) {
          // Skip the current restaurant (already saved above)
          if (targetRestaurantId === restaurantId) continue;

          try {
            // Ensure the target restaurant has the category
            const targetCategoriesDoc = await getDoc(getRecipeCategoriesDoc(targetRestaurantId));
            let targetCategories: string[] = [];

            if (targetCategoriesDoc.exists()) {
              targetCategories = targetCategoriesDoc.data().names || [];
            }

            // Add category if it doesn't exist in target restaurant
            if (!targetCategories.includes(formData.category)) {
              targetCategories.push(formData.category);
              await setDoc(getRecipeCategoriesDoc(targetRestaurantId), {
                names: targetCategories
              });
            }

            // When editing, search for existing recipe in target venue to update instead of creating duplicate
            if (editingRecipe) {
              // Search for existing recipe with the same name across all categories in target venue
              let existingRecipeFound = false;
              let existingRecipeId: string | null = null;
              let existingRecipeCategory: string | null = null;

              // Search through all categories in target venue
              for (const category of targetCategories) {
                const categoryQuery = query(
                  getRecipeCategoryCollection(targetRestaurantId, category),
                  orderBy('createdAt', 'desc')
                );
                const categorySnapshot = await getDocs(categoryQuery);
                
                // Check if a recipe with the same name exists
                const matchingRecipe = categorySnapshot.docs.find(
                  doc => doc.data().recipeName === formData.recipeName
                );

                if (matchingRecipe) {
                  existingRecipeFound = true;
                  existingRecipeId = matchingRecipe.id;
                  existingRecipeCategory = category;
                  break;
                }
              }

              if (existingRecipeFound && existingRecipeId && existingRecipeCategory) {
                // Recipe exists - update it
                // If category changed, move to new category
                if (existingRecipeCategory !== formData.category) {
                  // Delete from old category
                  await deleteDoc(
                    getRecipeInCategoryDoc(targetRestaurantId, existingRecipeCategory, existingRecipeId)
                  );
                  // Create in new category
                  await addDoc(
                    getRecipeCategoryCollection(targetRestaurantId, formData.category),
                    recipeData
                  );
                } else {
                  // Update in same category
                  await updateDoc(
                    getRecipeInCategoryDoc(targetRestaurantId, formData.category, existingRecipeId),
                    recipeData
                  );
                }
                console.log(`✅ Updated existing recipe "${formData.recipeName}" in venue ${targetRestaurantId}`);
              } else {
                // Recipe doesn't exist - create new one
                await addDoc(getRecipeCategoryCollection(targetRestaurantId, formData.category), recipeData);
                console.log(`➕ Created new recipe "${formData.recipeName}" in venue ${targetRestaurantId}`);
              }
            } else {
              // Creating new recipe (not editing) - always create new
              await addDoc(getRecipeCategoryCollection(targetRestaurantId, formData.category), recipeData);
            }
          } catch (error) {
            console.error(`Error copying recipe to ${targetRestaurantId}:`, error);
          }
        }
      }

      setShowModal(false);
      setEditingRecipe(null);
      resetForm();

      // Clear cache for all affected restaurants
      clearCache(restaurantId);
      selectedRestaurantIds.forEach(id => {
        if (id !== restaurantId) {
          clearCache(id);
        }
      });

      window.location.reload();
    } catch (error: any) {
      console.error('Error saving recipe:', error);
      if (error.code === 'permission-denied') {
        alert('Permission denied. Please check your account permissions.');
      } else if (error.code === 'not-found') {
        alert('Recipe not found. It may have been deleted.');
      } else {
        alert(`Error saving recipe: ${error.message || 'Please try again.'}`);
      }
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      category: '',
      image: [], // Reset to empty array
      ingredients: [''],
      instructions: [''],
      notes: '',
      recipeName: '',
    });

    setSelectedFiles([]); // Changed from setSelectedFile(null) to setSelectedFiles([])
    setExistingImageUrls([]); // Reset existing image URLs
    setSelectedRestaurantIds([]); // Reset selected restaurant IDs

    const fileInputs = document.querySelectorAll('input[type="file"]') as NodeListOf<HTMLInputElement>;
    fileInputs.forEach(fileInput => {
      fileInput.value = '';
    });
  };

  const handleEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    
    // Set existing Firebase URLs separately from preview URLs
    const existingImages = Array.isArray(recipe.image) ? recipe.image : (recipe.image ? [recipe.image] : []);
    setExistingImageUrls(existingImages);
    
    setFormData({
      category: recipe.category,
      image: existingImages, // Use actual Firebase URLs for display
      ingredients: recipe.ingredients.length > 0 ? recipe.ingredients : [''],
      instructions: recipe.instructions.length > 0 ? recipe.instructions : [''],
      notes: recipe.notes,
      recipeName: recipe.recipeName,
    });
    setSelectedFiles([]); // Changed from setSelectedFile(null) to setSelectedFiles([])
    setShowModal(true);
    
    setTimeout(() => {
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    }, 100);
  };

  const handleDelete = async (recipe: Recipe) => {
    if (!restaurantId) return;
    
    if (window.confirm('Are you sure you want to delete this recipe?')) {
      try {
        await deleteDoc(getRecipeInCategoryDoc(restaurantId, recipe.category, recipe.id));
        // Clear cache since recipes have been modified
        clearCache(restaurantId);
        // Reload recipes
        window.location.reload();
      } catch (error) {
        console.error('Error deleting recipe:', error);
      }
    }
  };

  const handleArchive = async (recipe: Recipe) => {
    if (!restaurantId || !user) return;
    
    try {
      const recipeRef = getRecipeInCategoryDoc(restaurantId, recipe.category, recipe.id);
      await updateDoc(recipeRef, {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: user.uid
      });
      // Clear cache since recipes have been modified
      clearCache(restaurantId);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error archiving recipe:', error);
      alert('Error archiving recipe. Please try again.');
    }
  };

  const handleRestore = async (recipe: Recipe) => {
    if (!restaurantId || !user) return;
    
    try {
      const recipeRef = getRecipeInCategoryDoc(restaurantId, recipe.category, recipe.id);
      await updateDoc(recipeRef, {
        archived: false,
        archivedAt: null,
        archivedBy: null
      });
      // Clear cache since recipes have been modified
      clearCache(restaurantId);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error restoring recipe:', error);
      alert('Error restoring recipe. Please try again.');
    }
  };

  const openAddModal = () => {
    setEditingRecipe(null);
    resetForm();
    setShowModal(true);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restaurantId || !newCategoryName.trim()) return;

    try {
      const categoryName = newCategoryName.trim();
      
      // Check if category already exists (case-insensitive)
      if (categories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
        alert('Category already exists!');
        return;
      }

      const newCategory: Category = {
        name: categoryName,
        archived: false,
        archivedAt: null,
        archivedBy: null,
      };

      const updatedCategories = [...categories, newCategory];

      await setDoc(getRecipeCategoriesDoc(restaurantId), {
        categories: updatedCategories,
        names: getCategoryNames(updatedCategories), // Keep for backward compatibility
      }, { merge: true });

      setCategories(updatedCategories);
      setNewCategoryName('');
      setShowCategoryModal(false);

      // Clear cache since categories have been modified
      clearCache(restaurantId);
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const openCategoryModal = () => {
    setNewCategoryName('');
    setShowCategoryModal(true);
  };

  const openManageCategoriesModal = () => {
    setShowManageCategoriesModal(true);
    // Cancel any editing when opening modal
    cancelEditingCategory();
  };

  const deleteCategory = async (categoryToDelete: string) => {
    if (!restaurantId) return;
    
    try {
      const updatedCategories = categories.filter(cat => cat.name !== categoryToDelete);
      
      await setDoc(getRecipeCategoriesDoc(restaurantId), {
        categories: updatedCategories,
        names: getCategoryNames(updatedCategories), // Keep for backward compatibility
      }, { merge: true });
      
      setCategories(updatedCategories);

      if (selectedCategory === categoryToDelete) {
        setSelectedCategory('');
      }

      // Clear cache since categories have been modified
      clearCache(restaurantId);
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const handleArchiveCategory = async (categoryName: string) => {
    if (!restaurantId || !user) return;
    
    if (!window.confirm(`Are you sure you want to archive "${categoryName}"? This will hide the category and all its recipes from the active view.`)) {
      return;
    }

    try {
      // Use current timestamp instead of serverTimestamp() since we're storing in an array
      const now = new Date();
      const updatedCategories = categories.map(cat => 
        cat.name === categoryName
          ? {
              ...cat,
              archived: true,
              archivedAt: Timestamp.fromDate(now),
              archivedBy: user.uid,
            }
          : cat
      );

      await setDoc(getRecipeCategoriesDoc(restaurantId), {
        categories: updatedCategories,
        names: getCategoryNames(updatedCategories), // Keep for backward compatibility
      }, { merge: true });

      setCategories(updatedCategories);
      
      // Clear cache since categories have been modified
      clearCache(restaurantId);
    } catch (error) {
      console.error('Error archiving category:', error);
      alert(`Error archiving category: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    }
  };

  const handleRestoreCategory = async (categoryName: string) => {
    if (!restaurantId || !user) return;
    
    if (!window.confirm(`Are you sure you want to restore "${categoryName}"? This will make the category and its recipes visible in the active view.`)) {
      return;
    }

    try {
      const updatedCategories = categories.map(cat => 
        cat.name === categoryName
          ? {
              ...cat,
              archived: false,
              archivedAt: null,
              archivedBy: null,
            }
          : cat
      );

      await setDoc(getRecipeCategoriesDoc(restaurantId), {
        categories: updatedCategories,
        names: getCategoryNames(updatedCategories), // Keep for backward compatibility
      }, { merge: true });

      setCategories(updatedCategories);
      
      // Clear cache since categories have been modified
      clearCache(restaurantId);
    } catch (error) {
      console.error('Error restoring category:', error);
      alert('Error restoring category. Please try again.');
    }
  };

  // Drag and drop handlers for categories
  const handleCategoryDragStart = (e: React.DragEvent, index: number) => {
    setDraggedCategoryIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCategoryDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleCategoryDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedCategoryIndex === null || draggedCategoryIndex === dropIndex || !restaurantId) {
      setDraggedCategoryIndex(null);
      return;
    }
    
    try {
      const displayCategories = getDisplayCategories();
      const draggedCategory = displayCategories[draggedCategoryIndex];
      
      // Update the full categories list
      const updatedCategories = [...categories];
      const fullIndex = updatedCategories.findIndex(cat => cat.name === draggedCategory.name);
      
      if (fullIndex === -1) {
        setDraggedCategoryIndex(null);
        return;
      }
      
      // Remove from current position
      const [movedCategory] = updatedCategories.splice(fullIndex, 1);
      
      // Find the target position in full list
      const targetDisplayCategory = displayCategories[dropIndex];
      const targetFullIndex = updatedCategories.findIndex(cat => cat.name === targetDisplayCategory.name);
      
      // Insert at new position
      updatedCategories.splice(targetFullIndex >= 0 ? targetFullIndex : dropIndex, 0, movedCategory);
      
      await setDoc(getRecipeCategoriesDoc(restaurantId), {
        categories: updatedCategories,
        names: getCategoryNames(updatedCategories), // Keep for backward compatibility
      }, { merge: true });
      
      setCategories(updatedCategories);
      
      // Clear cache since categories have been modified
      clearCache(restaurantId);
    } catch (error) {
      console.error('Error reordering category:', error);
    } finally {
      setDraggedCategoryIndex(null);
    }
  };

  const startEditingCategory = (index: number) => {
    const displayCategories = getDisplayCategories();
    setEditingCategoryIndex(index);
    setEditingCategoryName(displayCategories[index].name);
  };

  const cancelEditingCategory = () => {
    setEditingCategoryIndex(null);
    setEditingCategoryName('');
  };

  const saveCategoryEdit = async (index: number) => {
    if (!restaurantId) return;

    const displayCategories = getDisplayCategories();
    const oldCategory = displayCategories[index];
    const oldCategoryName = oldCategory.name;
    const newCategoryName = editingCategoryName.trim();

    // Validation
    if (!newCategoryName) {
      alert('Category name cannot be empty.');
      return;
    }

    if (newCategoryName === oldCategoryName) {
      // No change, just cancel editing
      cancelEditingCategory();
      return;
    }

    // Check for duplicates (case-insensitive)
    const duplicateIndex = categories.findIndex(
      (cat) => cat.name.toLowerCase() === newCategoryName.toLowerCase() && cat.name !== oldCategoryName
    );
    if (duplicateIndex !== -1) {
      alert(`A category named "${categories[duplicateIndex].name}" already exists.`);
      return;
    }

    try {
      // Get all recipes from the old category collection
      const oldCategoryQuery = query(
        getRecipeCategoryCollection(restaurantId, oldCategoryName),
        orderBy('createdAt', 'desc')
      );
      const oldCategorySnapshot = await getDocs(oldCategoryQuery);
      const recipesToMove = oldCategorySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Update category name in categories list
      const updatedCategories = categories.map(cat => 
        cat.name === oldCategoryName
          ? { ...cat, name: newCategoryName }
          : cat
      );

      // Ensure new category exists in categories list (it will since we're updating it)
      await setDoc(getRecipeCategoriesDoc(restaurantId), {
        categories: updatedCategories,
        names: getCategoryNames(updatedCategories), // Keep for backward compatibility
      }, { merge: true });

      // Move all recipes from old category collection to new category collection
      for (const recipe of recipesToMove) {
        const { id, ...recipeData } = recipe;
        const updatedRecipeData = {
          ...recipeData,
          category: newCategoryName, // Update category field in recipe data
        };

        // Create in new category collection
        await addDoc(getRecipeCategoryCollection(restaurantId, newCategoryName), updatedRecipeData);

        // Delete from old category collection
        await deleteDoc(getRecipeInCategoryDoc(restaurantId, oldCategoryName, id as string));
      }

      // Update local state
      setCategories(updatedCategories);

      // Update selected category if it was the one being edited
      if (selectedCategory === oldCategoryName) {
        setSelectedCategory(newCategoryName);
      }

      // Clear cache since categories and recipes have been modified
      clearCache(restaurantId);

      // Cancel editing mode
      cancelEditingCategory();

      // Reload to show updated recipes
      window.location.reload();
    } catch (error) {
      console.error('Error updating category name:', error);
      alert('Error updating category name. Please try again.');
    }
  };

  const addIngredient = () => {
    setFormData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, '']
    }));
  };

  const updateIngredient = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) => i === index ? value : ing)
    }));
  };

  const removeIngredient = (index: number) => {
    setFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index)
    }));
  };

  const addInstruction = () => {
    setFormData(prev => ({
      ...prev,
      instructions: [...prev.instructions, '']
    }));
  };

  const updateInstruction = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      instructions: prev.instructions.map((inst, i) => i === index ? value : inst)
    }));
  };

  const removeInstruction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      instructions: prev.instructions.filter((_, i) => i !== index)
    }));
  };

  const filteredRecipes = recipes.filter(recipe => {
    // Filter by archived status based on active tab (safety check - query should already handle this)
    const recipeArchived = recipe.archived === true;
    const categoryArchived = isCategoryArchived(recipe.category);
    
    // Determine if recipe should be shown based on tab
    let matchesArchivedStatus: boolean;
    if (activeTab === 'archived') {
      // Archived tab: show recipes that are archived OR recipes from archived categories
      matchesArchivedStatus = recipeArchived || categoryArchived;
    } else {
      // Active tab: show recipes that are not archived AND not from archived categories
      matchesArchivedStatus = !recipeArchived && !categoryArchived;
    }

    // Filter by category if selected
    const matchesCategory = selectedCategory ? recipe.category === selectedCategory : true;

    // Filter by search term if provided
    const matchesSearch = searchTerm.trim() === '' || (
      recipe.recipeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      recipe.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      recipe.ingredients.some(ingredient =>
        ingredient.toLowerCase().includes(searchTerm.toLowerCase())
      ) ||
      recipe.notes.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return matchesArchivedStatus && matchesCategory && matchesSearch;
  });

  // Print functionality
  const generateRecipePrintHTML = (recipe: Recipe) => {
    const images = Array.isArray(recipe.image) ? recipe.image : (recipe.image ? [recipe.image] : []);
    const validImages = images.filter(img => img && !img.includes('data:image/svg+xml'));

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Recipe: ${recipe.recipeName}</title>
        <style>
          @media print {
            @page {
              margin: 0.5in;
              size: A4;
            }
            * {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background: white;
            }
            .recipe-container {
              page-break-inside: avoid;
              transform: scale(0.75);
              transform-origin: top center;
              width: 133.33%;
              margin-left: -16.67%;
            }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f8fafc;
            margin: 0;
            padding: 20px;
          }
          .recipe-container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 18px;
            padding: 32px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          .recipe-title {
            font-size: 26px;
            font-weight: bold;
            color: #1a202c;
            text-align: center;
            margin-bottom: 16px;
          }
          .recipe-category {
            text-align: center;
            background: #f4f7ff;
            color: #3182ce;
            padding: 8px 24px;
            border-radius: 10px;
            font-weight: 600;
            margin: 0 auto 24px;
            display: inline-block;
          }
          .recipe-images {
            text-align: center;
            margin-bottom: 32px;
          }
          .recipe-image {
            max-width: 100%;
            width: 300px;
            height: 200px;
            object-fit: cover;
            border-radius: 18px;
            margin: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .section-title {
            font-size: 20px;
            font-weight: bold;
            color: #1a202c;
            margin: 24px 0 16px;
            text-align: center;
          }
          .ingredient-item {
            display: flex;
            align-items: center;
            margin-bottom: 6px;
            font-size: 16px;
          }
          .checkmark {
            color: #3182ce;
            font-size: 18px;
            margin-right: 8px;
            font-weight: bold;
          }
          .ingredient-text {
            color: #4a5568;
          }
          .instruction-item {
            display: flex;
            align-items: flex-start;
            background: #f4f7ff;
            border-radius: 14px;
            padding: 14px;
            margin-bottom: 16px;
          }
          .instruction-number {
            width: 32px;
            height: 32px;
            border-radius: 16px;
            background: #3182ce;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 16px;
            margin-right: 14px;
            margin-top: 2px;
            flex-shrink: 0;
          }
          .instruction-text {
            font-size: 16px;
            color: #1a202c;
            line-height: 22px;
            flex: 1;
          }
          .notes-section {
            background: #fef3c7;
            border: 1px solid #f59e0b;
            border-radius: 14px;
            padding: 16px;
            margin-top: 16px;
          }
          .notes-text {
            font-size: 16px;
            color: #4a5568;
            margin: 0;
          }
          .print-date {
            text-align: center;
            color: #718096;
            font-size: 14px;
            margin-top: 32px;
            border-top: 1px solid #e2e8f0;
            padding-top: 16px;
          }
        </style>
      </head>
      <body>
        <div class="recipe-container">
          <h1 class="recipe-title">${recipe.recipeName}</h1>
          <div class="recipe-category">Category: ${recipe.category}</div>

          ${validImages.length > 0 ? `
            <div class="recipe-images">
              <img src="${validImages[0]}" alt="Recipe image" class="recipe-image" />
            </div>
          ` : ''}

          <div class="section-title">Ingredients</div>
          ${recipe.ingredients.map(ingredient => `
            <div class="ingredient-item">
              <span class="checkmark">✓</span>
              <span class="ingredient-text">${ingredient}</span>
            </div>
          `).join('')}

          ${recipe.notes && recipe.notes.trim() ? `
            <div class="section-title">Allergens & Notes</div>
            <div class="notes-section">
              <p class="notes-text">${recipe.notes}</p>
            </div>
          ` : ''}

          <div class="print-date">
            Printed on ${new Date().toLocaleDateString()} from ChefFlow Admin
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handlePrintRecipe = (recipe: Recipe) => {
    const printHTML = generateRecipePrintHTML(recipe);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();

      // Wait for images to load before printing
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
    }
  };

  const handlePrintAll = async () => {
    setPrintingAll(true);

    try {
      const printHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>All Recipes - ChefFlow</title>
          <style>
            @media print {
              @page {
                margin: 0.5in;
                size: A4;
              }
              * {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                background: white;
              }
              .recipe-container {
                page-break-inside: avoid;
                page-break-after: always;
                transform: scale(0.75);
                transform-origin: top center;
                width: 133.33%;
                margin-left: -16.67%;
              }
              .page-break {
                page-break-before: always;
              }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              background: #f8fafc;
              margin: 0;
              padding: 20px;
            }
            .recipes-header {
              text-align: center;
              margin-bottom: 40px;
              padding-bottom: 20px;
              border-bottom: 2px solid #3182ce;
            }
            .recipes-title {
              font-size: 32px;
              font-weight: bold;
              color: #3182ce;
              margin-bottom: 8px;
            }
            .recipes-subtitle {
              color: #718096;
              font-size: 16px;
            }
            .recipe-container {
              background: white;
              border-radius: 18px;
              padding: 32px;
              margin-bottom: 40px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .recipe-title {
              font-size: 26px;
              font-weight: bold;
              color: #1a202c;
              text-align: center;
              margin-bottom: 16px;
            }
            .recipe-category {
              text-align: center;
              background: #f4f7ff;
              color: #3182ce;
              padding: 8px 24px;
              border-radius: 10px;
              font-weight: 600;
              margin: 0 auto 24px;
              display: inline-block;
            }
            .recipe-images {
              text-align: center;
              margin-bottom: 32px;
            }
            .recipe-image {
              max-width: 100%;
              width: 300px;
              height: 200px;
              object-fit: cover;
              border-radius: 18px;
              margin: 8px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .section-title {
              font-size: 20px;
              font-weight: bold;
              color: #1a202c;
              margin: 24px 0 16px;
              text-align: center;
            }
            .ingredient-item {
              display: flex;
              align-items: center;
              margin-bottom: 6px;
              font-size: 16px;
            }
            .checkmark {
              color: #3182ce;
              font-size: 18px;
              margin-right: 8px;
              font-weight: bold;
            }
            .ingredient-text {
              color: #4a5568;
            }
            .instruction-item {
              display: flex;
              align-items: flex-start;
              background: #f4f7ff;
              border-radius: 14px;
              padding: 14px;
              margin-bottom: 16px;
            }
            .instruction-number {
              width: 32px;
              height: 32px;
              border-radius: 16px;
              background: #3182ce;
              color: white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: bold;
              font-size: 16px;
              margin-right: 14px;
              margin-top: 2px;
              flex-shrink: 0;
            }
            .instruction-text {
              font-size: 16px;
              color: #1a202c;
              line-height: 22px;
              flex: 1;
            }
            .notes-section {
              background: #fef3c7;
              border: 1px solid #f59e0b;
              border-radius: 14px;
              padding: 16px;
              margin-top: 16px;
            }
            .notes-text {
              font-size: 16px;
              color: #4a5568;
              margin: 0;
            }
            .print-date {
              text-align: center;
              color: #718096;
              font-size: 14px;
              margin-top: 32px;
              border-top: 1px solid #e2e8f0;
              padding-top: 16px;
            }
            .page-break {
              page-break-before: always;
            }
          </style>
        </head>
        <body>
          <div class="recipes-header">
            <h1 class="recipes-title">Recipe Collection</h1>
            <p class="recipes-subtitle">Complete collection of ${filteredRecipes.length} recipes</p>
          </div>

          ${filteredRecipes.map((recipe, index) => {
            const images = Array.isArray(recipe.image) ? recipe.image : (recipe.image ? [recipe.image] : []);
            const validImages = images.filter(img => img && !img.includes('data:image/svg+xml'));

            return `
              <div class="recipe-container ${index > 0 ? 'page-break' : ''}">
                <h1 class="recipe-title">${recipe.recipeName}</h1>
                <div class="recipe-category">Category: ${recipe.category}</div>

                ${validImages.length > 0 ? `
                  <div class="recipe-images">
                    <img src="${validImages[0]}" alt="Recipe image" class="recipe-image" />
                  </div>
                ` : ''}

                <div class="section-title">Ingredients</div>
                ${recipe.ingredients.map(ingredient => `
                  <div class="ingredient-item">
                    <span class="checkmark">✓</span>
                    <span class="ingredient-text">${ingredient}</span>
                  </div>
                `).join('')}

                ${recipe.notes && recipe.notes.trim() ? `
                  <div class="section-title">Allergens & Notes</div>
                  <div class="notes-section">
                    <p class="notes-text">${recipe.notes}</p>
                  </div>
                ` : ''}

                <div class="print-date">
                  Printed on ${new Date().toLocaleDateString()} from ChefFlow Admin
                </div>
              </div>
            `;
          }).join('')}
        </body>
        </html>
      `;

      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(printHTML);
        printWindow.document.close();

        // Wait for all images to load before printing
        printWindow.onload = () => {
          const images = printWindow.document.querySelectorAll('img');
          let loadedImages = 0;
          const totalImages = images.length;

          if (totalImages === 0) {
            // No images, print immediately
            setTimeout(() => {
              printWindow.print();
            }, 500);
            return;
          }

          const checkAllImagesLoaded = () => {
            loadedImages++;
            if (loadedImages === totalImages) {
              // All images loaded, print now
              setTimeout(() => {
                printWindow.print();
              }, 500);
            }
          };

          // Add load listeners to all images
          images.forEach((img) => {
            if (img.complete) {
              checkAllImagesLoaded();
            } else {
              img.onload = checkAllImagesLoaded;
              img.onerror = checkAllImagesLoaded; // Still proceed if image fails to load
            }
          });

          // Fallback timeout in case some images don't trigger load events
          setTimeout(() => {
            printWindow.print();
          }, 3000);
        };
      }
    } catch (error) {
      console.error('Error generating print document:', error);
      alert('Error preparing recipes for printing. Please try again.');
    } finally {
      setPrintingAll(false);
    }
  };

  // Export recipes functionality
  const exportRecipes = async () => {
    if (!restaurantId) return;

    try {
      setExporting(true);

      // Fetch all recipes and categories
      const allCategoryNames = getCategoryNames(categories);

      const allRecipes: Recipe[] = [];

      for (const categoryName of allCategoryNames) {
        const categoryQuery = query(
          getRecipeCategoryCollection(restaurantId, categoryName),
          orderBy('createdAt', 'desc')
        );

        const snapshot = await getDocs(categoryQuery);
        const categoryRecipes = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
          } as Recipe;
        });

        allRecipes.push(...categoryRecipes);
      }

      // Create export data
      const exportData = {
        exportedAt: new Date().toISOString(),
        exportVersion: "1.0",
        restaurantId: restaurantId,
        categories: allCategoryNames,
        recipes: allRecipes
      };

      // Download as JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `recipes-export-${restaurantId}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert(`Successfully exported ${allRecipes.length} recipes!`);
    } catch (error) {
      console.error('Error exporting recipes:', error);
      alert('Error exporting recipes. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Import recipes functionality
  const importRecipes = async () => {
    if (!restaurantId || !importFile) return;

    try {
      setImporting(true);
      setImportProgress('Reading file...');

      const fileText = await importFile.text();
      const importData = JSON.parse(fileText);

      // Validate import data structure
      if (!importData.recipes || !Array.isArray(importData.recipes)) {
        throw new Error('Invalid file format. Missing recipes array.');
      }

      if (!importData.categories || !Array.isArray(importData.categories)) {
        throw new Error('Invalid file format. Missing categories array.');
      }

      setImportProgress(`Importing ${importData.recipes.length} recipes...`);

      // First, update categories
      const existingCategoryNames = getCategoryNames(categories);
      const newCategoryNames = importData.categories || [];
      
      // Merge new categories with existing ones (as Category objects)
      const mergedCategoryNames = [...new Set([...existingCategoryNames, ...newCategoryNames])];
      const mergedCategories: Category[] = mergedCategoryNames.map(name => {
        // Check if category already exists
        const existing = categories.find(cat => cat.name === name);
        if (existing) {
          return existing; // Keep existing category with its archived status
        }
        // Create new category (not archived)
        return {
          name,
          archived: false,
          archivedAt: null,
          archivedBy: null,
        };
      });

      await setDoc(getRecipeCategoriesDoc(restaurantId), {
        categories: mergedCategories,
        names: mergedCategoryNames, // Keep for backward compatibility
      }, { merge: true });

      // Import recipes
      let importedCount = 0;
      let skippedCount = 0;

      for (const recipe of importData.recipes) {
        try {
          setImportProgress(`Importing recipe ${importedCount + 1}/${importData.recipes.length}: ${recipe.recipeName}`);

          // Prepare recipe data (exclude the old ID to generate new ones)
          const recipeData = {
            category: recipe.category,
            image: recipe.image || [],
            ingredients: recipe.ingredients || [],
            instructions: recipe.instructions || [],
            notes: recipe.notes || '',
            recipeName: recipe.recipeName || recipe['recipe name'] || 'Imported Recipe',
            createdAt: new Date().toISOString(),
            archived: false, // Imported recipes are not archived by default
            archivedAt: null,
            archivedBy: null,
          };

          // Add recipe to the appropriate category
          await addDoc(getRecipeCategoryCollection(restaurantId, recipe.category), recipeData);
          importedCount++;
        } catch (recipeError) {
          console.error(`Error importing recipe ${recipe.recipeName}:`, recipeError);
          skippedCount++;
        }
      }

      setImportProgress(`Import completed! ${importedCount} recipes imported, ${skippedCount} skipped.`);

      // Clear cache since recipes have been imported
      clearCache(restaurantId);

      // Refresh the page to show new recipes
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      console.error('Error importing recipes:', error);
      setImportProgress(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="loading">
          <div className="spinner"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <style>{`
        @media (max-width: 640px) {
          .filtersRow {
            flex-direction: column !important;
          }
          .filtersRow > div {
            width: 100% !important;
            max-width: 100% !important;
          }
        }
      `}</style>
      <div>
        <div className="flex justify-between items-center mb-4" style={{ flexDirection: 'column', gap: '1rem', alignItems: 'stretch' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
            <h1 className="page-title" style={{ marginBottom: '0', textAlign: 'center' }}>Recipes</h1>
            {isLoadingFromCache && (
              <span style={{
                fontSize: '0.75rem',
                color: '#10b981',
                backgroundColor: '#ecfdf5',
                padding: '0.25rem 0.5rem',
                borderRadius: '12px',
                fontWeight: '500',
                border: '1px solid #d1fae5'
              }}>
                📱 Loaded from cache
              </span>
            )}
          </div>
          <div className="btn-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center', maxWidth: '100%', overflow: 'hidden' }}>
            <button onClick={exportRecipes} className="btn btn-secondary" disabled={exporting}>
              {exporting ? 'Exporting...' : 'Export Recipes'}
            </button>
            <button onClick={() => setShowImportModal(true)} className="btn btn-secondary">
              Import Recipes
            </button>
            <button onClick={handlePrintAll} className="btn btn-secondary" disabled={printingAll}>
              {printingAll ? 'Preparing...' : 'Print All Recipes'}
            </button>
            <button onClick={openCategoryModal} className="btn btn-secondary">
              Add Category
            </button>
            <button onClick={openManageCategoriesModal} className="btn btn-secondary">
              Manage Categories
            </button>
            <button onClick={openAddModal} className="btn btn-primary">
              Add Recipe
            </button>
          </div>
        </div>

        {/* Active/Archived Tabs */}
        <div style={{ 
          marginBottom: '1.5rem',
          borderBottom: '2px solid #e2e8f0',
          display: 'flex',
          gap: '0.5rem'
        }}>
          <button
            onClick={() => {
              setActiveTab('active');
              setSearchTerm('');
              setSelectedCategory('');
            }}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'active' ? '#3182ce' : '#64748b',
              borderBottom: activeTab === 'active' ? '3px solid #3182ce' : '3px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'active' ? '600' : '400',
              fontSize: '1rem',
              transition: 'all 0.2s ease',
              marginBottom: '-2px'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'active') {
                e.currentTarget.style.color = '#3182ce';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'active') {
                e.currentTarget.style.color = '#64748b';
              }
            }}
          >
            Active Recipes
          </button>
          <button
            onClick={() => {
              setActiveTab('archived');
              setSearchTerm('');
              setSelectedCategory('');
            }}
            style={{
              padding: '0.75rem 1.5rem',
              border: 'none',
              background: 'transparent',
              color: activeTab === 'archived' ? '#3182ce' : '#64748b',
              borderBottom: activeTab === 'archived' ? '3px solid #3182ce' : '3px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'archived' ? '600' : '400',
              fontSize: '1rem',
              transition: 'all 0.2s ease',
              marginBottom: '-2px'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== 'archived') {
                e.currentTarget.style.color = '#3182ce';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== 'archived') {
                e.currentTarget.style.color = '#64748b';
              }
            }}
          >
            Archived Recipes
          </button>
        </div>

        <div className="search-filters-container" style={{ marginBottom: '1rem' }}>
          <div className="filtersRow" style={{ 
            display: 'flex', 
            flexDirection: 'row',
            gap: '1rem',
            alignItems: 'flex-end',
            flexWrap: 'wrap'
          }}>
            <div className="search-container" style={{ flex: '1', minWidth: '200px' }}>
              <label className="form-label" style={{ 
                fontSize: '0.875rem', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '0.5rem',
                display: 'block'
              }}>
                Search Recipes
              </label>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  className="form-input"
                  style={{ 
                    width: '100%',
                    padding: searchTerm.trim() !== '' ? '0.625rem 2.5rem 0.625rem 0.875rem' : '0.625rem 0.875rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    backgroundColor: '#ffffff',
                    color: '#1f2937',
                    fontSize: '0.875rem',
                    fontWeight: '400',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                  }}
                  placeholder="Search by name, ingredients, category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onFocus={(e) => {
                    const target = e.target as HTMLInputElement;
                    target.style.borderColor = '#3182ce';
                    target.style.boxShadow = '0 0 0 3px rgba(49, 130, 206, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                  }}
                  onBlur={(e) => {
                    const target = e.target as HTMLInputElement;
                    target.style.borderColor = '#d1d5db';
                    target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                  }}
                  onMouseEnter={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (document.activeElement !== target) {
                      target.style.borderColor = '#9ca3af';
                      target.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const target = e.target as HTMLInputElement;
                    if (document.activeElement !== target) {
                      target.style.borderColor = '#d1d5db';
                      target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                    }
                  }}
                />
                {searchTerm.trim() !== '' && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{
                      position: 'absolute',
                      right: '0.625rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: '#f3f4f6',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#6b7280',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s ease',
                      lineHeight: '1'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#e5e7eb';
                      e.currentTarget.style.color = '#374151';
                      e.currentTarget.style.transform = 'translateY(-50%) scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                      e.currentTarget.style.color = '#6b7280';
                      e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                    }}
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <div style={{ minWidth: '200px', flex: '0 0 auto', width: '100%', maxWidth: '300px' }}>
              <label className="form-label" style={{ 
                fontSize: '0.875rem', 
                fontWeight: '500', 
                color: '#374151',
                marginBottom: '0.5rem',
                display: 'block'
              }}>
                Filter by Category
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  className="form-input"
                  style={{ 
                    width: '100%',
                    padding: '0.625rem 2.5rem 0.625rem 0.875rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.5rem',
                    backgroundColor: '#ffffff',
                    color: '#1f2937',
                    fontSize: '0.875rem',
                    fontWeight: '400',
                    cursor: 'pointer',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2 4L6 8L10 4' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 0.75rem center',
                    backgroundSize: '12px',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                  }}
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  onFocus={(e) => {
                    const target = e.target as HTMLSelectElement;
                    target.style.borderColor = '#3182ce';
                    target.style.boxShadow = '0 0 0 3px rgba(49, 130, 206, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                  }}
                  onBlur={(e) => {
                    const target = e.target as HTMLSelectElement;
                    target.style.borderColor = '#d1d5db';
                    target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                  }}
                  onMouseEnter={(e) => {
                    const target = e.target as HTMLSelectElement;
                    if (document.activeElement !== target) {
                      target.style.borderColor = '#9ca3af';
                      target.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const target = e.target as HTMLSelectElement;
                    if (document.activeElement !== target) {
                      target.style.borderColor = '#d1d5db';
                      target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                    }
                  }}
                >
                  <option value="">All Categories</option>
                  {(activeTab === 'archived' ? getArchivedCategories() : getActiveCategories()).map(category => (
                    <option key={category.name} value={category.name}>{category.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {(searchTerm.trim() !== '' || selectedCategory !== '') && (
          <div style={{
            marginBottom: '1rem',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
            fontStyle: 'italic'
          }}>
            {filteredRecipes.length === 0 ? 'No recipes match' :
             filteredRecipes.length === 1 ? '1 recipe matches' :
             `${filteredRecipes.length} recipes match`} your search criteria
          </div>
        )}

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Name</th>
                <th>Category</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecipes.map((recipe) => (
                <tr key={recipe.id}>
                  <td>
                    {Array.isArray(recipe.image) && recipe.image.length > 0 && !recipe.image[0].includes('data:image/svg+xml') ? (
                      <img 
                        src={recipe.image[0]} // Show first image from image array
                        alt={recipe.recipeName}
                        style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }}
                      />
                    ) : (typeof recipe.image === 'string' && recipe.image && !recipe.image.includes('data:image/svg+xml')) ? (
                      <img 
                        src={recipe.image} // Show single image (backwards compatibility)
                        alt={recipe.recipeName}
                        style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px' }}
                      />
                    ) : (
                      <div style={{ 
                        width: '50px', 
                        height: '50px', 
                        backgroundColor: '#f8fafc', 
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        color: '#64748b',
                        textAlign: 'center',
                        border: '1px solid #e2e8f0'
                      }}>
                        🍽️
                      </div>
                    )}
                  </td>
                  <td style={{ fontWeight: '500' }}>{recipe.recipeName}</td>
                  <td>{recipe.category}</td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setViewingRecipe(recipe);
                          setShowViewModal(true);
                        }}
                        className="btn btn-primary btn-sm"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handlePrintRecipe(recipe)}
                        className="btn btn-secondary btn-sm"
                        title="Print Recipe"
                      >
                        Print
                      </button>
                      <button
                        onClick={() => handleEdit(recipe)}
                        className="btn btn-secondary btn-sm"
                      >
                        Edit
                      </button>
                      {activeTab === 'active' ? (
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to archive this recipe?')) {
                              handleArchive(recipe);
                            }
                          }}
                          className="btn btn-secondary btn-sm"
                          title="Archive Recipe"
                        >
                          Archive
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (window.confirm('Are you sure you want to restore this recipe?')) {
                              handleRestore(recipe);
                            }
                          }}
                          className="btn btn-secondary btn-sm"
                          title="Restore Recipe"
                        >
                          Restore
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(recipe)}
                        className="btn btn-error btn-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredRecipes.length === 0 && (
            <div className="text-center" style={{ padding: '2rem', color: 'var(--text-secondary)' }}>
              {searchTerm.trim() !== '' || selectedCategory !== '' ? (
                <div>
                  <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No recipes match your search criteria</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-tertiary)' }}>
                    {searchTerm.trim() !== '' && `Searched for: "${searchTerm}"`}
                    {searchTerm.trim() !== '' && selectedCategory !== '' && ' • '}
                    {selectedCategory !== '' && `Category: "${selectedCategory}"`}
                  </div>
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCategory('');
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '1rem' }}
                  >
                    Clear Search
                  </button>
                </div>
              ) : (
                'No recipes found. Add your first recipe to get started!'
              )}
            </div>
          )}
        </div>

        {showModal && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '600px' }}>
              <div className="modal-header">
                <h2 className="modal-title">
                  {editingRecipe ? 'Edit Recipe' : 'Add Recipe'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label className="form-label">Recipe Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.recipeName}
                    onChange={(e) => setFormData(prev => ({ ...prev, recipeName: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Category</label>
                  <div style={{ position: 'relative' }}>
                    <select
                      className="form-input"
                      style={{ 
                        width: '100%',
                        padding: '0.625rem 2.5rem 0.625rem 0.875rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.5rem',
                        backgroundColor: '#ffffff',
                        color: '#1f2937',
                        fontSize: '0.875rem',
                        fontWeight: '400',
                        cursor: 'pointer',
                        appearance: 'none',
                        WebkitAppearance: 'none',
                        MozAppearance: 'none',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2 4L6 8L10 4' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'right 0.75rem center',
                        backgroundSize: '12px',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                      }}
                      value={formData.category}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      onFocus={(e) => {
                        const target = e.target as HTMLSelectElement;
                        target.style.borderColor = '#3182ce';
                        target.style.boxShadow = '0 0 0 3px rgba(49, 130, 206, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                      }}
                      onBlur={(e) => {
                        const target = e.target as HTMLSelectElement;
                        target.style.borderColor = '#d1d5db';
                        target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                      }}
                      onMouseEnter={(e) => {
                        const target = e.target as HTMLSelectElement;
                        if (document.activeElement !== target) {
                          target.style.borderColor = '#9ca3af';
                          target.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        const target = e.target as HTMLSelectElement;
                        if (document.activeElement !== target) {
                          target.style.borderColor = '#d1d5db';
                          target.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                        }
                      }}
                      required
                    >
                      <option value="">Select Category</option>
                      {getActiveCategories().map(category => (
                        <option key={category.name} value={category.name}>{category.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Copy to Additional Venues */}
                {availableRestaurants.length > 1 && (
                  <div className="form-group">
                    <label className="form-label" style={{ marginBottom: '0.5rem' }}>
                      Copy Recipe to Other Venues (Optional)
                    </label>
                    <div style={{
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.5rem'
                    }}>
                      Select venues where you want to copy this recipe. Recipe will always be saved to the current venue.
                    </div>
                    <div style={{
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      maxHeight: '200px',
                      overflowY: 'auto',
                      backgroundColor: '#f9fafb'
                    }}>
                      {availableRestaurants
                        .filter(restaurant => restaurant.id !== restaurantId) // Exclude current restaurant
                        .map(restaurant => (
                          <label
                            key={restaurant.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '0.5rem',
                              cursor: 'pointer',
                              borderRadius: '6px',
                              transition: 'background-color 0.2s',
                              marginBottom: '0.25rem'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f3f4f6';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedRestaurantIds.includes(restaurant.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRestaurantIds(prev => [...prev, restaurant.id]);
                                } else {
                                  setSelectedRestaurantIds(prev =>
                                    prev.filter(id => id !== restaurant.id)
                                  );
                                }
                              }}
                              style={{
                                marginRight: '0.5rem',
                                cursor: 'pointer',
                                width: '16px',
                                height: '16px'
                              }}
                            />
                            <span style={{ fontSize: '0.95rem' }}>
                              {restaurant.name}
                            </span>
                          </label>
                        ))}
                    </div>
                    {selectedRestaurantIds.length > 0 && (
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '0.5rem',
                        backgroundColor: '#ecfdf5',
                        border: '1px solid #10b981',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        color: '#065f46'
                      }}>
                        ✓ Recipe will be copied to {selectedRestaurantIds.length} additional venue{selectedRestaurantIds.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">
                    Recipe Pictures (Optional - Up to 8 images)
                  </label>
                  
                  {/* Display existing and new images with drag-and-drop sorting */}
                  {(existingImageUrls.length > 0 || selectedFiles.length > 0) && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Recipe Images ({existingImageUrls.length + selectedFiles.length}/8) - Drag to reorder:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {/* Show existing Firebase URLs with drag functionality */}
                        {existingImageUrls.map((imageUrl, index) => (
                          <div 
                            key={`existing-${index}`} 
                            style={{ 
                              position: 'relative',
                              cursor: 'move'
                            }}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, index)}
                          >
                            <img 
                              src={imageUrl} 
                              alt={`Existing image ${index + 1}`} 
                              style={{ 
                                width: '80px', 
                                height: '80px', 
                                objectFit: 'cover', 
                                borderRadius: '4px',
                                border: index === 0 ? '2px solid #10b981' : '1px solid var(--border)', // Green border for first image
                                opacity: draggedImageIndex === index ? 0.5 : 1
                              }} 
                            />
                            {index === 0 && (
                              <div style={{
                                position: 'absolute',
                                top: '2px',
                                left: '2px',
                                backgroundColor: '#10b981',
                                color: 'white',
                                fontSize: '8px',
                                padding: '2px 4px',
                                borderRadius: '3px',
                                fontWeight: 'bold',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                              }}>
                                1ST
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setExistingImageUrls(prev => prev.filter((_, i) => i !== index));
                                setFormData(prev => ({
                                  ...prev,
                                  image: prev.image.filter((_, i) => i !== index)
                                }));
                              }}
                              style={{
                                position: 'absolute',
                                top: '-5px',
                                right: '-5px',
                                width: '20px',
                                height: '20px',
                                borderRadius: '50%',
                                backgroundColor: '#ef4444',
                                color: 'white',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        
                        {/* Show new file previews with drag functionality */}
                        {selectedFiles.map((file, index) => {
                          const globalIndex = existingImageUrls.length + index;
                          return (
                            <div 
                              key={`new-${index}`} 
                              style={{ 
                                position: 'relative',
                                cursor: 'move'
                              }}
                              draggable
                              onDragStart={(e) => handleDragStart(e, globalIndex)}
                              onDragOver={handleDragOver}
                              onDrop={(e) => handleDrop(e, globalIndex)}
                            >
                              <img 
                                src={URL.createObjectURL(file)} 
                                alt={`New image ${index + 1}`} 
                                style={{ 
                                  width: '80px', 
                                  height: '80px', 
                                  objectFit: 'cover', 
                                  borderRadius: '4px',
                                  border: globalIndex === 0 ? '2px solid #10b981' : '2px solid #3b82f6', // Green for first, blue for new
                                  boxShadow: '0 0 0 1px #3b82f6, 0 2px 4px rgba(59, 130, 246, 0.3)',
                                  opacity: draggedImageIndex === globalIndex ? 0.5 : 1
                                }} 
                              />
                              {globalIndex === 0 && (
                                <div style={{
                                  position: 'absolute',
                                  top: '2px',
                                  left: '2px',
                                  backgroundColor: '#10b981',
                                  color: 'white',
                                  fontSize: '8px',
                                  padding: '2px 4px',
                                  borderRadius: '3px',
                                  fontWeight: 'bold',
                                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                                }}>
                                  1ST
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedFiles(prev => prev.filter((_, i) => i !== index));
                                }}
                                style={{
                                  position: 'absolute',
                                  top: '-5px',
                                  right: '-5px',
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  backgroundColor: '#ef4444',
                                  color: 'white',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                ×
                              </button>
                              <div style={{
                                position: 'absolute',
                                bottom: '2px',
                                right: '2px',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                fontSize: '8px',
                                padding: '2px 4px',
                                borderRadius: '3px',
                                fontWeight: 'bold',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)'
                              }}>
                                NEW
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        💡 Tip: Drag images to reorder them. The first image will be shown in the recipes table.
                      </div>
                    </div>
                  )}

                  {/* Add new images */}
                  {(existingImageUrls.length + selectedFiles.length) < 8 && (
                    <div>
                      <input
                        type="file"
                        className="form-input"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          const currentImageCount = existingImageUrls.length + selectedFiles.length;
                          const availableSlots = 8 - currentImageCount;
                          const filesToAdd = files.slice(0, availableSlots);
                          
                          if (filesToAdd.length > 0) {
                            setSelectedFiles(prev => [...prev, ...filesToAdd]);
                            
                            // Clear the input so the same files can be selected again if needed
                            if (e.target) {
                              e.target.value = '';
                            }
                          }
                        }}
                      />
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        You can add {8 - (existingImageUrls.length + selectedFiles.length)} more image(s). 
                        {existingImageUrls.length === 0 && selectedFiles.length === 0 && " Default image will be used if none selected."}
                        <br />
                        <span style={{ color: '#10b981', fontSize: '0.75rem' }}>
                          📸 Images will be automatically compressed for faster mobile loading
                        </span>
                        {selectedFiles.length > 0 && (
                          <div style={{ color: '#3b82f6', marginTop: '0.25rem' }}>
                            ✓ {selectedFiles.length} new image{selectedFiles.length > 1 ? 's' : ''} ready to upload
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Show default image when no images are selected */}
                  {existingImageUrls.length === 0 && selectedFiles.length === 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Default Image Preview:
                      </div>
                      <img 
                        src={getDefaultRecipeImage()} 
                        alt="Default recipe placeholder" 
                        style={{ 
                          width: '100px', 
                          height: '67px', 
                          objectFit: 'cover', 
                          borderRadius: '4px',
                          border: '1px solid var(--border)'
                        }} 
                      />
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        This default image will be used since no custom images are selected
                      </div>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Ingredients</label>
                  {formData.ingredients.map((ingredient, index) => (
                    <div key={index} className="flex gap-2 mb-2">
                      <input
                        type="text"
                        className="form-input"
                        value={ingredient}
                        onChange={(e) => updateIngredient(index, e.target.value)}
                        placeholder={`Ingredient ${index + 1}`}
                        required
                      />
                      {formData.ingredients.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeIngredient(index)}
                          className="btn btn-error btn-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addIngredient}
                    className="btn btn-secondary btn-sm"
                  >
                    Add Ingredient
                  </button>
                </div>

                <div className="form-group">
                  <label className="form-label">Instructions</label>
                  {formData.instructions.map((instruction, index) => (
                    <div key={index} className="flex gap-2 mb-2">
                      <textarea
                        className="form-input form-textarea"
                        value={instruction}
                        onChange={(e) => updateInstruction(index, e.target.value)}
                        placeholder={`Step ${index + 1}`}
                        rows={2}
                        required
                      />
                      {formData.instructions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeInstruction(index)}
                          className="btn btn-error btn-sm"
                          style={{ alignSelf: 'flex-start' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addInstruction}
                    className="btn btn-secondary btn-sm"
                  >
                    Add Instruction
                  </button>
                </div>

                <div className="form-group">
                  <label className="form-label">Allergens</label>
                  <textarea
                    className="form-input form-textarea"
                    value={formData.notes}
                    onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    placeholder="List any allergens in this recipe (e.g., nuts, dairy, gluten)..."
                  />
                </div>

                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary" disabled={uploading}>
                    {uploading ? (selectedFiles.length > 0 ? 'Compressing & Uploading...' : 'Uploading...') : (editingRecipe ? 'Update Recipe' : 'Add Recipe')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn btn-secondary"
                    disabled={uploading}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showCategoryModal && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '400px' }}>
              <div className="modal-header">
                <h2 className="modal-title">Add New Category</h2>
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleAddCategory}>
                <div className="form-group">
                  <label className="form-label">Category Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Enter category name"
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <button type="submit" className="btn btn-primary">
                    Add Category
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showManageCategoriesModal && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '600px' }}>
              <div className="modal-header">
                <h2 className="modal-title">Manage Categories</h2>
                <button
                  onClick={() => setShowManageCategoriesModal(false)}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <div className="modal-body">
                <div className="space-y-4">
                  <p className="text-gray-600 mb-4">
                    Edit category names using the ✏️ button, drag categories by the handle (☰) to reorder them. Archive categories to hide them and their recipes, or delete categories you no longer need. Note: Recipes in deleted categories will remain but won't be visible until moved to another category.
                  </p>
                  
                  {/* Category Tabs */}
                  <div style={{ 
                    borderBottom: '2px solid #e2e8f0',
                    display: 'flex',
                    gap: '0.5rem',
                    marginBottom: '1rem'
                  }}>
                    <button
                      onClick={() => setCategoryTab('active')}
                      style={{
                        padding: '0.5rem 1rem',
                        border: 'none',
                        background: 'transparent',
                        color: categoryTab === 'active' ? '#3182ce' : '#64748b',
                        borderBottom: categoryTab === 'active' ? '3px solid #3182ce' : '3px solid transparent',
                        cursor: 'pointer',
                        fontWeight: categoryTab === 'active' ? '600' : '400',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s ease',
                        marginBottom: '-2px'
                      }}
                    >
                      Active Categories
                    </button>
                    <button
                      onClick={() => setCategoryTab('archived')}
                      style={{
                        padding: '0.5rem 1rem',
                        border: 'none',
                        background: 'transparent',
                        color: categoryTab === 'archived' ? '#3182ce' : '#64748b',
                        borderBottom: categoryTab === 'archived' ? '3px solid #3182ce' : '3px solid transparent',
                        cursor: 'pointer',
                        fontWeight: categoryTab === 'archived' ? '600' : '400',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s ease',
                        marginBottom: '-2px'
                      }}
                    >
                      Archived Categories
                    </button>
                  </div>
                  
                  {getDisplayCategories().length === 0 ? (
                    <p className="text-gray-500">
                      {categoryTab === 'archived' 
                        ? 'No archived categories.' 
                        : 'No categories available.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {getDisplayCategories().map((category, index) => (
                        <div
                          key={category.name}
                          draggable
                          onDragStart={(e) => handleCategoryDragStart(e, index)}
                          onDragOver={handleCategoryDragOver}
                          onDrop={(e) => handleCategoryDrop(e, index)}
                          className="flex items-center justify-between p-3 border border-gray-200 rounded-lg cursor-move transition-all"
                          style={{
                            opacity: draggedCategoryIndex === index ? 0.5 : 1,
                            backgroundColor: draggedCategoryIndex === index ? '#f3f4f6' : 'white'
                          }}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <div
                              className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
                              style={{
                                userSelect: 'none',
                                fontSize: '18px',
                                lineHeight: '1'
                              }}
                              title="Drag to reorder"
                            >
                              ☰
                            </div>
                            <div className="flex items-center gap-2 flex-1">
                              {editingCategoryIndex === index ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="text"
                                    value={editingCategoryName}
                                    onChange={(e) => setEditingCategoryName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        saveCategoryEdit(index);
                                      } else if (e.key === 'Escape') {
                                        cancelEditingCategory();
                                      }
                                    }}
                                    className="form-input"
                                    style={{
                                      padding: '4px 8px',
                                      fontSize: '14px',
                                      flex: 1,
                                      maxWidth: '300px'
                                    }}
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => saveCategoryEdit(index)}
                                    className="btn btn-sm"
                                    style={{
                                      backgroundColor: '#10b981',
                                      color: 'white',
                                      border: 'none',
                                      padding: '4px 8px',
                                      fontSize: '12px'
                                    }}
                                    title="Save"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={cancelEditingCategory}
                                    className="btn btn-sm"
                                    style={{
                                      backgroundColor: '#6b7280',
                                      color: 'white',
                                      border: 'none',
                                      padding: '4px 8px',
                                      fontSize: '12px'
                                    }}
                                    title="Cancel"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <span className="font-medium">{category.name}</span>
                                  <span className="text-xs text-gray-400">({index + 1})</span>
                                  {category.archived && (
                                    <span className="text-xs text-gray-500" style={{ fontStyle: 'italic' }}>
                                      (Archived)
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          {editingCategoryIndex !== index && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditingCategory(index);
                                }}
                                className="btn btn-sm"
                                style={{
                                  backgroundColor: '#f59e0b',
                                  color: 'white',
                                  border: 'none',
                                  padding: '4px 8px',
                                  fontSize: '12px'
                                }}
                                title="Edit category name"
                              >
                                ✏️
                              </button>
                              {categoryTab === 'active' ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleArchiveCategory(category.name);
                                  }}
                                  className="btn btn-sm"
                                  style={{
                                    backgroundColor: '#6b7280',
                                    color: 'white',
                                    border: 'none',
                                    padding: '4px 8px',
                                    fontSize: '12px'
                                  }}
                                  title="Archive category"
                                >
                                  Archive
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRestoreCategory(category.name);
                                  }}
                                  className="btn btn-sm"
                                  style={{
                                    backgroundColor: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    padding: '4px 8px',
                                    fontSize: '12px'
                                  }}
                                  title="Restore category"
                                >
                                  Restore
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Are you sure you want to delete the "${category.name}" category?`)) {
                                    deleteCategory(category.name);
                                  }
                                }}
                                className="btn btn-sm"
                                style={{
                                  backgroundColor: '#ef4444',
                                  color: 'white',
                                  border: 'none',
                                  padding: '4px 8px',
                                  fontSize: '12px'
                                }}
                                title="Delete"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button
                  onClick={() => {
                    cancelEditingCategory();
                    setShowManageCategoriesModal(false);
                  }}
                  className="btn btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Import Modal */}
        {showImportModal && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '600px' }}>
              <div className="modal-header">
                <h2 className="modal-title">Import Recipes</h2>
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setImportProgress('');
                  }}
                  className="modal-close"
                  disabled={importing}
                >
                  ×
                </button>
              </div>

              <div className="modal-body">
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="font-semibold text-blue-800 mb-2">📋 Import Instructions</h3>
                    <ul className="text-sm text-blue-700 space-y-1">
                      <li>• Select a JSON file that was exported from another restaurant</li>
                      <li>• New categories will be created automatically if they don't exist</li>
                      <li>• Recipe images may not transfer (will use default images)</li>
                      <li>• Existing recipes will not be overwritten</li>
                    </ul>
                  </div>

                  {!importing && (
                    <div className="form-group">
                      <label className="form-label">Select Recipe Export File (JSON)</label>
                      <input
                        type="file"
                        className="form-input"
                        accept=".json"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          setImportFile(file || null);
                          setImportProgress('');
                        }}
                      />
                      {importFile && (
                        <div className="text-sm text-green-600 mt-2">
                          ✓ Selected: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                        </div>
                      )}
                    </div>
                  )}

                  {importProgress && (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded">
                      <div className="text-sm text-gray-700">{importProgress}</div>
                      {importing && (
                        <div className="mt-2">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '50%' }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <div className="flex gap-2">
                  <button
                    onClick={importRecipes}
                    className="btn btn-primary"
                    disabled={!importFile || importing}
                  >
                    {importing ? 'Importing...' : 'Import Recipes'}
                  </button>
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportFile(null);
                      setImportProgress('');
                    }}
                    className="btn btn-secondary"
                    disabled={importing}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recipe Detail View Modal */}
        {showViewModal && viewingRecipe && (
          <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '800px' }}>
              <div className="modal-header">
                <h2 className="modal-title">{viewingRecipe.recipeName}</h2>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setViewingRecipe(null);
                  }}
                  className="modal-close"
                >
                  ×
                </button>
              </div>

              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {/* Recipe Images */}
                {Array.isArray(viewingRecipe.image) && viewingRecipe.image.length > 0 && !viewingRecipe.image[0].includes('data:image/svg+xml') ? (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1rem', fontWeight: '600' }}>Recipe Images</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {viewingRecipe.image.map((imageUrl, index) => (
                        <img
                          key={index}
                          src={imageUrl}
                          alt={`${viewingRecipe.recipeName} - Image ${index + 1}`}
                          style={{
                            width: '120px',
                            height: '120px',
                            objectFit: 'cover',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            cursor: 'pointer'
                          }}
                          onClick={() => window.open(imageUrl, '_blank')}
                          title="Click to view full size"
                        />
                      ))}
                    </div>
                  </div>
                ) : (typeof viewingRecipe.image === 'string' && viewingRecipe.image && !viewingRecipe.image.includes('data:image/svg+xml')) ? (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1rem', fontWeight: '600' }}>Recipe Image</h3>
                    <img
                      src={viewingRecipe.image}
                      alt={viewingRecipe.recipeName}
                      style={{
                        width: '200px',
                        height: '200px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        cursor: 'pointer'
                      }}
                      onClick={() => window.open(viewingRecipe.image as string, '_blank')}
                      title="Click to view full size"
                    />
                  </div>
                ) : null}

                {/* Category */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ marginBottom: '0.5rem', fontSize: '1.1rem', fontWeight: '600' }}>Category</h3>
                  <span style={{
                    backgroundColor: 'var(--primary)',
                    color: 'white',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '12px',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}>
                    {viewingRecipe.category}
                  </span>
                </div>

                {/* Ingredients */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1rem', fontWeight: '600' }}>
                    Ingredients ({viewingRecipe.ingredients.length})
                  </h3>
                  <ul style={{ paddingLeft: '1.25rem', lineHeight: '1.6' }}>
                    {viewingRecipe.ingredients.map((ingredient, index) => (
                      <li key={index} style={{ marginBottom: '0.25rem' }}>
                        {ingredient}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Instructions */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1rem', fontWeight: '600' }}>
                    Instructions ({viewingRecipe.instructions.length} steps)
                  </h3>
                  <ol style={{ paddingLeft: '1.25rem', lineHeight: '1.6' }}>
                    {viewingRecipe.instructions.map((instruction, index) => (
                      <li key={index} style={{ marginBottom: '0.75rem', paddingLeft: '0.25rem' }}>
                        <strong>Step {index + 1}:</strong> {instruction}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Allergens/Notes */}
                {viewingRecipe.notes && viewingRecipe.notes.trim() !== '' && (
                  <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1rem', fontWeight: '600' }}>Allergens & Notes</h3>
                    <div style={{
                      backgroundColor: '#fef3c7',
                      border: '1px solid #f59e0b',
                      borderRadius: '8px',
                      padding: '0.75rem',
                      lineHeight: '1.5'
                    }}>
                      {viewingRecipe.notes}
                    </div>
                  </div>
                )}

                {/* Recipe Metadata */}
                <div style={{
                  marginTop: '1.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--border)',
                  fontSize: '0.875rem',
                  color: 'var(--text-secondary)'
                }}>
                  <p><strong>Created:</strong> {new Date(viewingRecipe.createdAt).toLocaleDateString()}</p>
                  <p><strong>Recipe ID:</strong> {viewingRecipe.id}</p>
                </div>
              </div>

              <div className="modal-footer">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowViewModal(false);
                      setViewingRecipe(null);
                      handleEdit(viewingRecipe);
                    }}
                    className="btn btn-secondary"
                  >
                    Edit Recipe
                  </button>
                  <button
                    onClick={() => {
                      setShowViewModal(false);
                      setViewingRecipe(null);
                    }}
                    className="btn btn-primary"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Recipes;
