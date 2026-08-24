# 📥 Data Upload Folder

Drop files here via GitHub's web interface to automatically update the tool.

## How to Upload

1. Go to **github.com/Abdallllllah/Solar-Iriigation**
2. Navigate into the **`uploads/`** folder
3. Click **"Add file" → "Upload files"**
4. Drag & drop your files
5. Click **"Commit changes"**
6. Wait ~5 minutes — GitHub Actions will process the data and deploy automatically

## What You Can Upload

### Crop Data (CSV)
- **File format**: `<crop>_crop_data.csv` (e.g., `maize_crop_data.csv`)
- **Supported crops**: maize, cassava, onion, potato, sorghum, tomato, wheat
- **What happens**: The CSV is automatically preprocessed into JSON and the compare files are rebuilt

### Road Shapefiles
- **File format**: All shapefile components together (`.shp`, `.dbf`, `.shx`, `.prj`)
- **Naming**: Use the country name as prefix (e.g., `ethiopia_roads.shp`)
- **What happens**: Shapefiles are converted to GeoJSON and road distances are recalculated

## How to Check Status

After uploading:
1. Go to the **"Actions"** tab on the GitHub repository
2. You'll see a running workflow — click it to see progress
3. ✅ Green checkmark = success (site auto-deploys within 30 seconds)
4. ❌ Red X = something went wrong (click to see error details)
