const API = {
    cache: new Map(),
    cacheTimeout: 5 * 60 * 1000, // 5 minutes

    async searchProducts(searchKey) {
        // Check cache first
        const cacheKey = `search:${searchKey}`;
        const cached = this.getFromCache(cacheKey);
        if (cached) return cached;

        try {
            const [temuResponse, shopeeResponse, tikiResponse] = await Promise.all([
                this.searchTemu(searchKey),
                this.searchShopee(searchKey),
                this.searchTiki(searchKey)
            ]);

            const results = this.mergeResults(temuResponse, shopeeResponse, tikiResponse);
            this.setCache(cacheKey, results);
            return results;
        } catch (error) {
            console.error('Search API Error:', error);
            throw error;
        }
    },

    getFromCache(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > this.cacheTimeout) {
            this.cache.delete(key);
            return null;
        }
        return cached.data;
    },

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    },

    async searchTemu(searchKey) {
        try {
            const response = await fetch('/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ searchKey })
            });

            const data = await response.json();
            console.log('Temu API Response:', data);
            
            if (data.result?.result?.kp_ds_item_list) {
                return data.result.result.kp_ds_item_list
                    .filter(item => item.ds_item_type === "GOODS")
                    .map(item => {
                        const goods = item.common_rec_goods;
                        return {
                            id: goods.goods_id,
                            name: goods.title,
                            image: goods.thumb_url,
                            price: goods.price_info.price,
                            marketPrice: goods.price_info.market_price,
                            salesTip: goods.sales_tip,
                            link: goods.platform === 'partner' 
                                ? goods.detail_url 
                                : `https://www.temu.com${goods.seo_link_url}&_x_ads_channel=kol_affiliate&_x_ads_sub_channel=affiliate`,
                            platform: goods.platform === 'partner' ? goods.partner_name : 'temu'
                        };
                    });
            }
            return [];
        } catch (error) {
            console.error('Temu API Error:', error);
            throw error;
        }
    },

    getRandomMarketPrice(price) {
        // Random từ 20% đến 60%
        const randomPercent = Math.floor(Math.random() * (60 - 20 + 1)) + 20;
        const multiplier = 1 + (randomPercent / 100);
        return Math.round(price * multiplier);
    },

    async searchShopee(searchKey) {
        try {
            const response = await fetch('/search-shopee', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ searchKey })
            });

            const data = await response.json();
            
            if (!response.ok) {
                console.error('API Error:', data);
                return [];
            }

            return data.map(product => ({
                id: product.product_base_id,
                name: product.name,
                image: product.url_thumbnail,
                price: product.price,
                marketPrice: this.getRandomMarketPrice(product.price),
                salesTip: `Đã bán ${product.historical_sold || 0}`,
                link: this.generateShopeeAffLink(product.product_base_id),
                platform: 'shopee'
            }));
        } catch (error) {
            console.error('Shopee search error:', error);
            return [];
        }
    },

    async searchTiki(searchKey) {
        try {
            const response = await fetch('/search-tiki', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ searchKey })
            });

            const data = await response.json();
            
            if (!response.ok) {
                console.error('Tiki API Error:', data);
                return [];
            }

            return data.map(product => ({
                id: product.product_base_id,
                name: product.name,
                image: product.url_thumbnail,
                price: product.price,
                marketPrice: this.getRandomMarketPrice(product.price),
                salesTip: `Đã bán ${product.historical_sold || 0}`,
                link: `https://tiki.vn/p${product.product_base_id.split('__').pop()}.html`,
                platform: 'tiki'
            }));
        } catch (error) {
            console.error('Tiki search error:', error);
            return [];
        }
    },

    generateShopeeAffLink(productBaseId) {
        const [_, itemid, shopid] = productBaseId.split('__');
        return `https://shopee.vn/product/${shopid}/${itemid}?utm_content=----&utm_medium=affiliates&utm_source=an_17384580144`;
    },

    mergeResults(temuProducts, shopeeProducts, tikiProducts) {
        // Tách sản phẩm đối tác và sản phẩm Temu
        const partnerProducts = temuProducts.filter(p => p.platform !== 'temu');
        const temuOnlyProducts = temuProducts.filter(p => p.platform === 'temu');
        
        // Tạo mảng chứa sản phẩm Temu, Shopee và Tiki để trộn ngẫu nhiên
        const otherProducts = [];
        const maxOtherLength = Math.max(
            temuOnlyProducts.length, 
            shopeeProducts.length,
            tikiProducts.length
        );
        
        // Xen kẽ và trộn ngẫu nhiên sản phẩm
        for (let i = 0; i < maxOtherLength; i++) {
            const productsToAdd = [];
            if (i < temuOnlyProducts.length) {
                productsToAdd.push(temuOnlyProducts[i]);
            }
            if (i < shopeeProducts.length) {
                productsToAdd.push(shopeeProducts[i]);
            }
            if (i < tikiProducts.length) {
                productsToAdd.push(tikiProducts[i]);
            }
            otherProducts.push(...productsToAdd.sort(() => Math.random() - 0.5));
        }

        // Thêm thuộc tính sortOrder để duy trì thứ tự
        const finalResults = [
            ...partnerProducts.map(p => ({ ...p, sortOrder: 1 })),
            ...otherProducts.map(p => ({ ...p, sortOrder: 2 }))
        ];

        console.log('Partner products:', partnerProducts.length);
        console.log('Other products:', otherProducts.length);
        
        return finalResults;
    },

    async getFeaturedProducts() {
        try {
            const response = await fetch('/api/featured-products');
            if (!response.ok) {
                throw new Error('Failed to fetch featured products');
            }
            const data = await response.json();
            console.log('Featured products:', data); // Để debug
            return data;
        } catch (error) {
            console.error('Error fetching featured products:', error);
            return [];
        }
    },
};