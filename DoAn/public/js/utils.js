const Utils = {
    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    },

    calculateDiscount(original, current) {
        return Math.round((1 - current / original) * 100);
    },

    filterProducts(products, { minPrice, maxPrice, platforms }) {
        return products.filter(product => {
            const price = product.price;
            if (minPrice && price < minPrice) return false;
            if (maxPrice && price > maxPrice) return false;
            
            if (platforms && platforms.length > 0) {
                const productPlatform = product.platform.toLowerCase();
                if (!platforms.includes(productPlatform)) return false;
            }
            
            return true;
        });
    },

    sortProducts(products, sortType) {
        return [...products].sort((a, b) => {
            switch (sortType) {
                case 'price_asc':
                    return a.price - b.price;
                case 'price_desc':
                    return b.price - a.price;
                case 'sales':
                    const salesA = parseInt(a.salesTip.replace(/[^\d]/g, '')) || 0;
                    const salesB = parseInt(b.salesTip.replace(/[^\d]/g, '')) || 0;
                    return salesB - salesA;
                default:
                    return 0;
            }
        });
    },

    async retryOperation(operation, maxRetries = 3) {
        let lastError;
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
            }
        }
        
        throw lastError;
    },

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};