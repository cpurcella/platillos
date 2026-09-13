(function(root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.photoFraming = factory();
})(typeof window !== 'undefined' ? window : this, function() {
    function validBox(box) {
        return box && ['x', 'y', 'width', 'height'].every(function(key) { return typeof box[key] === 'number' && isFinite(box[key]); }) &&
            box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 && box.x + box.width <= 1.000001 && box.y + box.height <= 1.000001;
    }
    function subjectRect(width, height, box) {
        if (!validBox(box)) box = { x: 0, y: 0, width: 1, height: 1 };
        var x = Math.floor(Math.max(0, box.x - 0.035) * width);
        var y = Math.floor(Math.max(0, box.y - 0.035) * height);
        return { x: x, y: y, width: Math.min(width, Math.ceil((box.x + box.width + 0.035) * width)) - x, height: Math.min(height, Math.ceil((box.y + box.height + 0.035) * height)) - y };
    }
    function frame(width, height, aspect, box) {
        if (!width || !height || !aspect || !validBox(box)) return { fit: 'contain', position: '50% 50%' };
        // Keep a small margin around the complete subject, not just its center.
        var left = Math.max(0, box.x - 0.035) * width;
        var top = Math.max(0, box.y - 0.035) * height;
        var right = Math.min(1, box.x + box.width + 0.035) * width;
        var bottom = Math.min(1, box.y + box.height + 0.035) * height;
        var cropWidth = Math.min(width, height * aspect);
        var cropHeight = cropWidth / aspect;
        if (right - left > cropWidth + 0.01 || bottom - top > cropHeight + 0.01) return { fit: 'contain', position: '50% 50%' };
        var x = Math.max(0, Math.min(width - cropWidth, (left + right - cropWidth) / 2));
        var y = Math.max(0, Math.min(height - cropHeight, (top + bottom - cropHeight) / 2));
        return {
            fit: 'cover', x: x, y: y, width: cropWidth, height: cropHeight,
            position: (width === cropWidth ? 50 : x / (width - cropWidth) * 100) + '% ' + (height === cropHeight ? 50 : y / (height - cropHeight) * 100) + '%'
        };
    }
    return { validBox: validBox, frame: frame, subjectRect: subjectRect };
});
