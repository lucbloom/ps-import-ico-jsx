// PNG to ICO Converter Script for Photoshop
// Fixed binary writing for proper ICO format

function writeBytes(file, bytes) {
    var str = "";
    for (var i = 0; i < bytes.length; i++) {
        str += String.fromCharCode(bytes[i]);
    }
    file.write(str);
}

function writeUInt16LE(file, value) {
    writeBytes(file, [value & 0xFF, (value >> 8) & 0xFF]);
}

function writeUInt32LE(file, value) {
    writeBytes(file, [
        value & 0xFF,
        (value >> 8) & 0xFF,
        (value >> 16) & 0xFF,
        (value >> 24) & 0xFF
    ]);
}

function writeUInt8(file, value) {
    writeBytes(file, [value & 0xFF]);
}

function getPNGBytes(doc, size) {
    // Create duplicate and resize
    var tempDoc = doc.duplicate();
    tempDoc.resizeImage(UnitValue(size, "px"), UnitValue(size, "px"), null, ResampleMethod.BICUBICSHARPER);
    
    // Export to temp PNG
    var tempFile = new File(Folder.temp + "/temp_icon_" + size + ".png");
    var pngOptions = new ExportOptionsSaveForWeb();
    pngOptions.format = SaveDocumentType.PNG;
    pngOptions.PNG8 = false;
    pngOptions.transparency = true;
    pngOptions.quality = 100;
    
    tempDoc.exportDocument(tempFile, ExportType.SAVEFORWEB, pngOptions);
    tempDoc.close(SaveOptions.DONOTSAVECHANGES);
    
    // Read PNG as binary
    tempFile.encoding = "BINARY";
    tempFile.open("r");
    var pngData = tempFile.read();
    tempFile.close();
    tempFile.remove();
    
    return pngData;
}

function saveAsICO() {
    try {
        if (!app.documents.length) {
            alert("No document is open. Please open a PNG file first.");
            return;
        }
        
        var doc = app.activeDocument;
        var savePath = File.saveDialog("Save ICO file as:", "*.ico");
        
        if (!savePath) return;
        
        if (!savePath.name.match(/\.ico$/i)) {
            savePath = new File(savePath.path + "/" + savePath.name + ".ico");
        }
        
        // Single size ICO (32x32) for reliability
        var iconSize = 32;
        var pngData = getPNGBytes(doc, iconSize);
        
        // Create ICO file
        var icoFile = new File(savePath);
        icoFile.encoding = "BINARY";
        icoFile.open("w");
        
        // ICO Header (6 bytes)
        writeUInt16LE(icoFile, 0);        // Reserved (must be 0)
        writeUInt16LE(icoFile, 1);        // Type (1 = ICO, 2 = CUR)
        writeUInt16LE(icoFile, 1);        // Number of images
        
        // Directory Entry (16 bytes)
        writeUInt8(icoFile, iconSize);    // Width (0 = 256)
        writeUInt8(icoFile, iconSize);    // Height (0 = 256) 
        writeUInt8(icoFile, 0);           // Color palette (0 = no palette)
        writeUInt8(icoFile, 0);           // Reserved
        writeUInt16LE(icoFile, 1);        // Color planes
        writeUInt16LE(icoFile, 32);       // Bits per pixel
        writeUInt32LE(icoFile, pngData.length); // Image data size
        writeUInt32LE(icoFile, 22);       // Offset to image data (6 + 16 = 22)
        
        // Write PNG data directly
        icoFile.write(pngData);
        icoFile.close();
        
        alert("ICO file created successfully!\nLocation: " + savePath.fsName);
        
    } catch (error) {
        alert("Error creating ICO file:\n" + error.toString());
    }
}

// Multi-size ICO version
function saveAsMultiSizeICO() {
    try {
        if (!app.documents.length) {
            alert("No document is open.");
            return;
        }
        
        var doc = app.activeDocument;
        var savePath = File.saveDialog("Save multi-size ICO file as:", "*.ico");
        
        if (!savePath) return;
        
        if (!savePath.name.match(/\.ico$/i)) {
            savePath = new File(savePath.path + "/" + savePath.name + ".ico");
        }
        
        // Standard ICO sizes
        var sizes = [16, 32, 48];
        var imageData = [];
        
        // Generate PNG data for each size
        for (var i = 0; i < sizes.length; i++) {
            var size = sizes[i];
            var pngBytes = getPNGBytes(doc, size);
            imageData.push({
                size: size,
                data: pngBytes,
                length: pngBytes.length
            });
        }
        
        // Calculate data offset
        var dataOffset = 6 + (sizes.length * 16); // Header + directory entries
        
        // Create ICO file
        var icoFile = new File(savePath);
        icoFile.encoding = "BINARY";
        icoFile.open("w");
        
        // Write ICO header
        writeUInt16LE(icoFile, 0);              // Reserved
        writeUInt16LE(icoFile, 1);              // Type
        writeUInt16LE(icoFile, sizes.length);   // Number of images
        
        // Write directory entries
        for (var i = 0; i < imageData.length; i++) {
            var img = imageData[i];
            
            writeUInt8(icoFile, img.size);           // Width
            writeUInt8(icoFile, img.size);           // Height
            writeUInt8(icoFile, 0);                  // Palette
            writeUInt8(icoFile, 0);                  // Reserved
            writeUInt16LE(icoFile, 1);               // Color planes
            writeUInt16LE(icoFile, 32);              // Bits per pixel
            writeUInt32LE(icoFile, img.length);      // Data size
            writeUInt32LE(icoFile, dataOffset);      // Data offset
            
            dataOffset += img.length;
        }
        
        // Write image data
        for (var i = 0; i < imageData.length; i++) {
            icoFile.write(imageData[i].data);
        }
        
        icoFile.close();
        alert("Multi-size ICO file created!\nSizes: " + sizes.join(", ") + "px\nLocation: " + savePath.fsName);
        
    } catch (error) {
        alert("Error: " + error.toString());
    }
}

// Run single-size version (more reliable)
saveAsICO();
