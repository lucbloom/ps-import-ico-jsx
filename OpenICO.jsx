#target photoshop

function readU8(file) {
	return file.readch().charCodeAt(0);
}

function readU16(file) {
	return readU8(file) + (readU8(file) << 8);
}

function readU32(file) {
	return readU8(file) + (readU8(file) << 8) + (readU8(file) << 16) + (readU8(file) << 24);
}

function openICO() {
	var file = File.openDialog("Select a .ico file");
	if (!file) return;

	if (!file.open("rb")) {
		alert("Failed to open file.");
		return;
	}

	// Read ICONDIR
	var reserved = readU16(file);
	var type = readU16(file);
	var count = readU16(file);

	if (reserved !== 0 || type !== 1 || count < 1) {
		alert("Not a valid .ico file.");
		return;
	}

	// Read entries
	var entries = [];
	for (var i = 0; i < count; i++) {
		var w = readU8(file); if (w === 0) w = 256;
		var h = readU8(file); if (h === 0) h = 256;
		readU8(file); // colorCount
		readU8(file); // reserved
		readU16(file); // planes
		var bitCount = readU16(file);
		var bytesInRes = readU32(file);
		var offset = readU32(file);
		entries.push({ w: w, h: h, bitCount: bitCount, offset: offset, bytesInRes: bytesInRes });
	}

	// Pick best entry: first 32-bit BMP
	var entry = null;
	for (var i = 0; i < entries.length; i++) {
		if (entries[i].bitCount === 32) {
			entry = entries[i];
			break;
		}
	}

	if (!entry) {
		alert("The .ico file format is not supported.\n\nNo 32-bit BMP entry found.\n\nAvailable entries:\n" +
			entries.map(function(e, i) {
				return "Entry " + i + ": " + e.w + "x" + e.h + ", bitCount=" + e.bitCount;
			}).join("\n"));
		file.close();
		return;
	}

	file.seek(entry.offset, 0);

	// Read BITMAPINFOHEADER
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

	if (compression !== 0) {
		var compressionHex = "0x" + (compression >>> 0).toString(16).toUpperCase();
		alert("Unsupported icon format:\n\n" +
			"compression: " + compressionHex + "\n\n" +
			"Only uncompressed 32-bit BMP icons are supported.");
		file.close();
		return;
	}

	if (bpp !== 32) {
		alert("Unsupported icon format:\n\n" +
			"bitCount from header: " + bpp + "\n" +
			"Only uncompressed 32-bit BMP icons are supported.");
		file.close();
		return;
	}

	// Create new document
	var doc = app.documents.add(bmpWidth, bmpHeight, 72, "ICO Import", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);

	// Read pixel data
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

	// Paint pixels
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

	file.close();
	alert("Imported " + bmpWidth + "×" + bmpHeight + " icon.");
}

openICO();
