const UI = {
    // ... existing methods ...

    optimizeImageUrl(url, width = 300) {
        // Add width parameter for Shopee images
        if (url.includes('shopee.vn')) {
            return `${url}_tn?width=${width}`;
        }
        // For Temu images
        if (url.includes('temu.com')) {
            return `${url}?width=${width}&quality=80`;
        }
        return url;
    },

    displayProducts(products) {
        this.elements.productsGrid.innerHTML = '';
        
        if (products.length === 0) {
            this.elements.productsGrid.innerHTML = 
                '<div class="col-12 text-center">Không tìm thấy sản phẩm nào</div>';
            return;
        }

        products.forEach(product => {
            const template = this.elements.productTemplate.content.cloneNode(true);
            
            const image = template.querySelector('.product-image');
            image.src = this.optimizeImageUrl(product.image);
            image.loading = 'lazy'; // Enable lazy loading
            image.alt = product.name;

            // ... rest of the product rendering code ...
        });
    }
}; 