#target photoshop

function readU8(file) {
	var byteStr = file.read(1);
	if (byteStr === null || byteStr.length !== 1) {
		throw new Error("Unexpected EOF reading U8");
	}
	return byteStr.charCodeAt(0);
}

function readU16(file) {
	// little endian
	var b0 = readU8(file);
	var b1 = readU8(file);
	return b0 + (b1 << 8);
}

function readU32(file) {
	var b0 = readU8(file);
	var b1 = readU8(file);
	var b2 = readU8(file);
	var b3 = readU8(file);
	return b0 + (b1 << 8) + (b2 << 16) + (b3 << 24);
}

// Read multiple bytes into a Uint8Array (array of numbers)
function readBytes(file, count) {
	var dataStr = file.read(count);
	if (dataStr === null || dataStr.length < count) {
		throw new Error("Unexpected EOF reading bytes");
	}
	var arr = [];
	for (var i = 0; i < count; i++) {
		arr.push(dataStr.charCodeAt(i));
	}
	return arr;
}

function openICO() {
	var file = File.openDialog("Select a .ico file");
	if (!file) return;
	
	file.encoding = "BINARY";
	file.lineFeed = "Unix"; 

	if (!file.open("rb")) {
		alert("Failed to open file.");
		return;
	}

	// Read ICONDIR header
	var reserved = readU16(file);
	var type = readU16(file);
	var count = readU16(file);

	if (reserved !== 0 || type !== 1 || count < 1) {
		alert("Not a valid .ico file.");
		file.close();
		return;
	}

	// Read entries
	var numFound = 0;
	for (var i = 0; i < count; i++) {
		var b = readBytes(file, 16);
		var entry = {
			i: i,
			n: count,
			width: b[0] || 256,
			height: b[1] || 256,
			colorCount: b[2],
			// b[3] is reserved
			planes: b[4] + (b[5] << 8),
			bitCount: b[6] + (b[7] << 8),
			bytesInRes: b[8] + (b[9] << 8) + (b[10] << 16) + (b[11] << 24),
			imageOffset: b[12] + (b[13] << 8) + (b[14] << 16) + (b[15] << 24),
		};
		if (processEntry(file, entry)) {
			++numFound;
		}
	}

	file.close();

	if (!numFound) {
		alert("No valid icon entries found.");
	}
}

function processEntry(file, entry) {
	//alert("Entry [" + entry.i + "] w:" + entry.width + " h:" + entry.height + " b:" + entry.bitCount + " o:" + entry.imageOffset + " r:" + entry.bytesInRes);

	file.seek(entry.imageOffset, 0);

	// Look for PNG signature bytes anywhere in buffer
	var pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]; // ‰PNG\r\n

	var maxScan = 32;
	var sigStr = file.read(maxScan);
	var dbg = "";
	for (var ii = 0; ii < 8; ii++) {
		dbg += "0x" + sigStr.charCodeAt(ii).toString(16).toUpperCase() + " ";
	}

	var pngOffset = -1;
	for (var i = 0; i <= maxScan - pngSignature.length; i++) {
		var match = true;
		for (var ii = 0; ii < 8; ii++) {
			if (sigStr.charCodeAt(i + ii) !== pngSignature[ii]) {
				match = false;
				break;
			}
		}
		if (match) {
			pngOffset = i;
			break;
		}
	}

	if (pngOffset >= 0) {
		// Found PNG signature at offset pngOffset inside entry data
		file.seek(entry.imageOffset + pngOffset, 0);
		var byteCount = entry.bytesInRes - pngOffset;
		var bytesArr = readBytes(file, byteCount);

		var pngData = "";
		for (var i = 0; i < byteCount; i++) {
			pngData += String.fromCharCode(bytesArr[i]);
		}

		var tempFileName = file.name;
        var lastDot = tempFileName.lastIndexOf('.');
        tempFileName = (lastDot !== -1) ? tempFileName.substring(0, lastDot) : tempFileName;
		if (entry.n > 1) { tempFileName += "." + (entry.i + 1); }
		var tempFile = File(Folder.temp + "/" + tempFileName + ".png");
		alert(tempFile);
		//setClipboard(tempFile);
		tempFile.encoding = "BINARY";
		tempFile.lineFeed = "Unix"; 
		if (tempFile.open("wb")) {
			tempFile.write(pngData);
			tempFile.close();
			file.close();
			app.open(tempFile);
			return true;
		}

		alert("Failed to write temporary PNG file.");
		file.close();
		return;
	}

	// Else fallback to BMP reading here...
	if (entry.bitCount !== 32) {
		return;
	}

	// Otherwise assume uncompressed 32-bit BMP (read BITMAPINFOHEADER)
	var headerSize = readU32(file);
	var bmpWidth = readU32(file);
	var bmpHeight = readU32(file) / 2;
	var planes = readU16(file);
	var bpp = readU16(file);
	var compression = readU32(file);
	readU32(file); // imageSize
	readU32(file); // XPelsPerMeter
	readU32(file); // YPelsPerMeter
	readU32(file); // clrUsed
	readU32(file); // clrImportant

	if (compression !== 0 || bpp !== 32) {
		var compressionHex = "0x" + (compression >>> 0).toString(16).toUpperCase();
		alert("Unsupported icon format:\n\n" +
			"compression: " + compressionHex + "\n\n" +
			"bitCount from header: " + bpp + "\n" +
			"entry: " + entry.i + "\n" +
			"Only uncompressed 32-bit BMP or PNG compressed icons are supported.");
		return;
	}

	// Create new document
	var doc = app.documents.add(bmpWidth, bmpHeight, 72, "ICO Import", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);

	// Read pixel data (bottom-up order)
	var pixels = [];
	for (var y = 0; y < bmpHeight; y++) {
		var row = [];
		for (var x = 0; x < bmpWidth; x++) {
			var b = readU8(file);
			var g = readU8(file);
			var r = readU8(file);
			var a = readU8(file);
			row.push([r, g, b, a]);
		}
		pixels.push(row);
	}

	// Paint pixels to document
	var sel = doc.selection;
	var color = new SolidColor();

	for (var y = 0; y < bmpHeight; y++) {
		for (var x = 0; x < bmpWidth; x++) {
			var px = pixels[y][x];
			var r = px[0], g = px[1], b = px[2], a = px[3];
			if (a === 0) continue;

			color.rgb.red = r;
			color.rgb.green = g;
			color.rgb.blue = b;

			sel.select([[x, bmpHeight - y - 1], [x + 1, bmpHeight - y - 1], [x + 1, bmpHeight - y], [x, bmpHeight - y]]);
			sel.fill(color, ColorBlendMode.NORMAL, a / 255 * 100, false);
		}
	}

	return true;
}

//function generateGUID() {
//	var s4 = function() {
//		return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
//	};
//	// Example: 'xxxx-xxxx-xxxx-xxxx'
//	return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4();
//}

//function setClipboard(text, verbose) {
//    verbose = verbose || false;
//    var methods = [];
//    var errors = [];
//    
//    // Method 1: Direct system command with temporary file (Most reliable)
//    methods.push(function() {
//        try {
//            var tempFile = new File(Folder.temp + "/ps_clipboard_" + new Date().getTime() + ".txt");
//            tempFile.encoding = "UTF-8";
//            
//            if (!tempFile.open("w")) {
//                throw new Error("Could not create temporary file");
//            }
//            
//            tempFile.write(text);
//            tempFile.close();
//            
//            var command;
//            var result;
//            
//            if ($.os.indexOf("Windows") !== -1) {
//                command = 'cmd /c type "' + tempFile.fsName + '" | clip';
//                result = system.callSystem(command);
//            } else if ($.os.indexOf("Mac") !== -1) {
//                command = 'pbcopy < "' + tempFile.fsName + '"';
//                result = system.callSystem(command);
//            } else {
//                throw new Error("Unsupported OS for method 1");
//            }
//            
//            tempFile.remove();
//            
//            if (verbose) alert("Method 1 (Direct command) succeeded");
//            return true;
//            
//        } catch (e) {
//            errors.push("Method 1 failed: " + e.message);
//            if (tempFile && tempFile.exists) {
//                try { tempFile.remove(); } catch (cleanupError) {}
//            }
//            return false;
//        }
//    });
//    
//    // Method 2: Windows batch file approach
//    methods.push(function() {
//        if ($.os.indexOf("Windows") === -1) {
//            errors.push("Method 2 skipped: Windows only");
//            return false;
//        }
//        
//        try {
//            var batFile = new File(Folder.temp + "/setclip_" + new Date().getTime() + ".bat");
//            batFile.open("w");
//            
//            // Escape quotes and write batch file
//            var escapedText = text.replace(/"/g, '""');
//            batFile.write('@echo off\r\n');
//            batFile.write('echo ' + escapedText + ' | clip\r\n');
//            batFile.close();
//            
//            var result = system.callSystem('"' + batFile.fsName + '"');
//            batFile.remove();
//            
//            if (verbose) alert("Method 2 (Batch file) succeeded");
//            return true;
//            
//        } catch (e) {
//            errors.push("Method 2 failed: " + e.message);
//            if (batFile && batFile.exists) {
//                try { batFile.remove(); } catch (cleanupError) {}
//            }
//            return false;
//        }
//    });
//    
//    // Method 3: PowerShell approach (Windows)
//    methods.push(function() {
//        if ($.os.indexOf("Windows") === -1) {
//            errors.push("Method 3 skipped: Windows only");
//            return false;
//        }
//        
//        try {
//            var psFile = new File(Folder.temp + "/setclip_" + new Date().getTime() + ".ps1");
//            psFile.open("w");
//            
//            // PowerShell script to set clipboard
//            var psScript = 'Set-Clipboard -Value @"\r\n' + text + '\r\n"@';
//            psFile.write(psScript);
//            psFile.close();
//            
//            var command = 'powershell -ExecutionPolicy Bypass -File "' + psFile.fsName + '"';
//            var result = system.callSystem(command);
//            psFile.remove();
//            
//            if (verbose) alert("Method 3 (PowerShell) succeeded");
//            return true;
//            
//        } catch (e) {
//            errors.push("Method 3 failed: " + e.message);
//            if (psFile && psFile.exists) {
//                try { psFile.remove(); } catch (cleanupError) {}
//            }
//            return false;
//        }
//    });
//    
//    // Method 4: AppleScript approach (macOS)
//    methods.push(function() {
//        if ($.os.indexOf("Mac") === -1) {
//            errors.push("Method 4 skipped: macOS only");
//            return false;
//        }
//        
//        try {
//            var applescriptFile = new File(Folder.temp + "/setclip_" + new Date().getTime() + ".applescript");
//            applescriptFile.open("w");
//            
//            // AppleScript to set clipboard
//            var escapedText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
//            var script = 'set the clipboard to "' + escapedText + '"';
//            applescriptFile.write(script);
//            applescriptFile.close();
//            
//            var command = 'osascript "' + applescriptFile.fsName + '"';
//            var result = system.callSystem(command);
//            applescriptFile.remove();
//            
//            if (verbose) alert("Method 4 (AppleScript) succeeded");
//            return true;
//            
//        } catch (e) {
//            errors.push("Method 4 failed: " + e.message);
//            if (applescriptFile && applescriptFile.exists) {
//                try { applescriptFile.remove(); } catch (cleanupError) {}
//            }
//            return false;
//        }
//    });
//    
//    // Method 5: Binary clipboard write (Windows - experimental)
//    methods.push(function() {
//        if ($.os.indexOf("Windows") === -1) {
//            errors.push("Method 5 skipped: Windows only");
//            return false;
//        }
//        
//        try {
//            // Create a VBScript to set clipboard
//            var vbsFile = new File(Folder.temp + "/setclip_" + new Date().getTime() + ".vbs");
//            vbsFile.open("w");
//            
//            var vbsScript = 'CreateObject("WScript.Shell").Run "cmd /c echo ' + 
//                           text.replace(/"/g, '""') + ' | clip", 0, True';
//            vbsFile.write(vbsScript);
//            vbsFile.close();
//            
//            var command = 'cscript //nologo "' + vbsFile.fsName + '"';
//            var result = system.callSystem(command);
//            vbsFile.remove();
//            
//            if (verbose) alert("Method 5 (VBScript) succeeded");
//            return true;
//            
//        } catch (e) {
//            errors.push("Method 5 failed: " + e.message);
//            if (vbsFile && vbsFile.exists) {
//                try { vbsFile.remove(); } catch (cleanupError) {}
//            }
//            return false;
//        }
//    });
//    
//    // Method 6: Simple echo command (fallback)
//    methods.push(function() {
//        try {
//            var command;
//            
//            if ($.os.indexOf("Windows") !== -1) {
//                // Simple Windows approach
//                command = 'cmd /c echo ' + text.replace(/[&<>"|]/g, '^$&') + ' | clip';
//            } else if ($.os.indexOf("Mac") !== -1) {
//                // Simple macOS approach
//                command = 'echo "' + text.replace(/"/g, '\\"') + '" | pbcopy';
//            } else {
//                throw new Error("Unsupported OS");
//            }
//            
//            var result = system.callSystem(command);
//            
//            if (verbose) alert("Method 6 (Simple echo) succeeded");
//            return true;
//            
//        } catch (e) {
//            errors.push("Method 6 failed: " + e.message);
//            return false;
//        }
//    });
//    
//    // Try each method in order
//    for (var i = 0; i < methods.length; i++) {
//        try {
//            if (methods[i]()) {
//                return true; // Success!
//            }
//        } catch (e) {
//            errors.push("Method " + (i + 1) + " exception: " + e.message);
//        }
//    }
//    
//    // All methods failed
//    if (verbose) {
//        var errorMessage = "All clipboard methods failed:\n\n";
//        for (var j = 0; j < errors.length; j++) {
//            errorMessage += errors[j] + "\n";
//        }
//        alert(errorMessage);
//    }
//    
//    return false;
//}

openICO();

