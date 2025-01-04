const express = require('express');
const router = express.Router();
const axios = require('axios');

// Thêm hàm chuyển đổi chuỗi có dấu thành không dấu
function convertToSlug(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd')
        .replace(/([^0-9a-z-\s])/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
}

// Route cho trang tìm kiếm
router.get('/timkiem', (req, res) => {
    const searchKey = req.query.q || '';
    res.render('search', { searchKey });
});

// Thêm hàm mới để format dữ liệu sản phẩm cho chatbot
function formatProductsForChat(products, searchKey) {
    // Lọc chỉ lấy sản phẩm từ đối tác
    const partnerProducts = products.filter(p => !p.common_rec_goods || p.common_rec_goods.platform === 'partner');
    const topProducts = partnerProducts.slice(0, 1);
    
    const productInfo = topProducts.map(p => {
        if (p.common_rec_goods) {
            return {
                name: (p.common_rec_goods.goods_name || p.common_rec_goods.title || 'Không có tên')
                    .split(',')[0]
                    .substring(0, 100),
                price: p.common_rec_goods.price_info?.price || 0,
                marketPrice: p.common_rec_goods.price_info?.market_price || 0,
                platform: 'Temu'
            };
        } else {
            return {
                name: (p.name || 'Không có tên')
                    .split(',')[0]
                    .substring(0, 100),
                price: parseFloat(p.price) || 0,
                marketPrice: parseFloat(p.market_price) || parseFloat(p.price) || 0,
                platform: p.partner_name || 'Partner'
            };
        }
    });

    const validProducts = productInfo.filter(p => 
        p.name !== 'Không có tên' && 
        p.price > 0 && 
        p.marketPrice > 0
    );

    const contextMessage = `
Sản phẩm cần mua "${searchKey}"
Tư vấn ${validProducts.length} sản phẩm trên Web:
${validProducts.map((p, index) => 
    `${index + 1}. ${p.name} 
   - Giá: ${p.price.toLocaleString('vi-VN')}đ
   - Giảm: ${Math.round((1 - p.price/p.marketPrice) * 100)}%
   - Từ: ${p.platform}`
).join('\n')}`;

    return {
        greeting: contextMessage,
        products: validProducts
    };
}

// API tìm kiếm Temu và Partners
router.post('/search', async (req, res) => {
    const { searchKey } = req.body;
    const pool = req.app.locals.pool; // Lấy pool từ app.locals

    if (!searchKey || typeof searchKey !== 'string') {
        return res.status(400).json({ error: 'searchKey không hợp lệ' });
    }

    try {
        // Tìm sản phẩm từ partners
        const [partnerProducts] = await pool.query(`
            SELECT 
                p.*,
                pa.name as partner_name,
                pa.website as partner_website,
                CASE 
                    WHEN p.name LIKE ? THEN 3
                    WHEN p.name LIKE ? THEN 2
                    WHEN p.name LIKE ? THEN 1
                END as match_score
            FROM products p 
            LEFT JOIN partners pa ON p.partner_id = pa.id 
            WHERE p.status = true 
            AND (
                p.name LIKE ? OR
                p.name LIKE ? OR
                p.name LIKE ?
            )
            ORDER BY match_score DESC, p.priority DESC, p.created_at DESC
        `, [
            searchKey,
            `${searchKey}%`,
            `%${searchKey}%`,
            searchKey,
            `${searchKey}%`,
            `%${searchKey}%`
        ]);

        // Chuyển đổi sản phẩm partners thành định dạng của Temu
        const partnerItems = partnerProducts.map(p => ({
            ds_item_type: "GOODS",
            common_rec_goods: {
                goods_id: p.id,
                mall_id: p.partner_id,
                title: p.name,
                goods_name: p.name,
                thumb_url: p.image_url,
                detail_url: p.product_url.startsWith('http') ? p.product_url : `https://${p.product_url}`,
                link_url: 'goods.html',
                seo_link_url: '',
                platform: 'partner',
                partner_name: p.partner_name,
                sales_tip: p.sales_count ? `Đã bán ${p.sales_count}` : '',
                sales_tip_text: p.sales_count ? [p.sales_count.toString(), "Đã bán"] : [],
                description: p.description,
                price_info: {
                    price: Number(p.price),
                    currency: "VND",
                    currency_str: "₫",
                    price_str: `₫${Number(p.price).toLocaleString('vi-VN')}`,
                    price_text: ["₫", Number(p.price).toLocaleString('vi-VN'), ""],
                    market_price: Number(p.market_price || p.price),
                    market_price_str: `₫${Number(p.market_price || p.price).toLocaleString('vi-VN')}`,
                    market_price_text: ["₫", Number(p.market_price || p.price).toLocaleString('vi-VN'), ""],
                    reduction: p.market_price ? Math.round((1 - p.price/p.market_price) * 100) : 0,
                    reduction_text: p.market_price ? [`-${Math.round((1 - p.price/p.market_price) * 100)}`, "%"] : []
                },
                image: {
                    url: p.image_url,
                    width: 1600,
                    height: 1600
                }
            }
        }));

        let allProducts = [...partnerItems];
        
        try {
            // Tìm sản phẩm từ Temu
            const temuResponse = await axios.post('https://www.temu.com/api/link/leica/cps/share_order/query_goods_v3', {
                data: {
                    offset: 0,
                    page_size: 20,
                    search_key: searchKey,
                    page_sn: 13788,
                    scene: "SEARCH_QUERY",
                    list_id: Math.random().toString(36).substring(2, 12),
                    has_filter_region: true,
                    has_filter_tab: true,
                    use_condition: true
                }
            }, {
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'vi,vi-VN;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6,zh;q=0.5',
                    'anti-content': '0aqAfxnUDicYY99acYzPWgB02YlPksg9hOHqMesFdP_YpV1pgjpdBAxqhEbQMqjlDJIpF5PoKNs4Wg94P-KBaX0ljfVEBGVsA9s-441-s5EQhjR8quijL1Z1GNcWucLRhfEcWfikRWMz6FqOhxNcyEqt_Oa_iADKOgUtdLy-2mLpcnTeGC-JeqqwBZeGn5Om2MZwP_aSffY2XsyMs8rxqfmFSwymHb4Mtkdd_qfKSaKNZiNfBTSEFt_0Ur-xHmMIMrMjWk7ZRLlLpClH-yUlO9YJT80cTUOeg6pTC5bLyrCrI3WoxcL1FhhFHiv5qR-5B6uYZ2Sdp35fuU0W7Ntq5XJBCQ00-89kgL9VRXn4n1CzyzXMf0SUgIuVKe-kPEszSWca2OuQ8m6fXbbBqoCOk4Ny9yDHJ66PN1PDFV80DTGa55snWYqwb1aDCvvHzTo-TdGWNk1_wpod2qFabBQVYj2NjEJ1O2S8gmhnZElEGgPJQwVcTCZnCMF3EV9uo2p5axJKjoShElpAL3k388GjNhiESdBwAx_ck_NjJc-heMSq5cuHoHWynm3MMJthZ139AToI-Ag1eEZ3',
                    'content-type': 'application/json;charset=UTF-8',
                    'cookie': 'region=217; currency=VND; api_uid=CmxUOmdGwCVyWABP1PhWAg==; timezone=Asia%2FBangkok; webp=1; _nano_fp=XpmqX5EJlpUjl0EaXC_X9JxhOVBrS~mpb5v6Rwtx; _bee=nROGWz58PqmC0KWWd6Ai1NV4R6cutjnr; njrpl=nROGWz58PqmC0KWWd6Ai1NV4R6cutjnr; dilx=vi0z4oFQWwhkACIkGyD9z; hfsc=L3yJeo856zz71p7Peg==; _ttc=3.s7piWo3f8hFI.1764228247; _hal_tag=APcp2fcbEyvxrX4pjo2fj5EC3cWmzeZTYFRP4+CZw0NY0mGlrvy2AmZbPjyzBUevNg==; user_uin=BACKKQS5LCFQE3BGIZDYF2IBJCKSRVU5U4NEP3IO; language=en; AccessToken=2M2YKCBM6F7BT53W2WL7RZPOAXAYN3OSKSP54WBVDMXBFFLD36AA0110d96020cc; isLogin=1735111913763; __cf_bm=rFKZ8eT32_tDChC5cUD52PBM_uVHTI42ezXUNKA77JM-1735114002-1.0.1.1-TQmt.6EtBUzclxU8VNeUZKvSh0c3tjOIld.WpypHaOLXnPeJnwT9qlxkkpGPPhoTGei61pTD0CHTSGSya4GMPw',
                    'origin': 'https://www.temu.com',
                    'priority': 'u=1, i',
                    'referer': 'https://www.temu.com/afc_share_goods.html?_x_ads_csite=search&_x_ads_channel=kol_affiliate&_x_cid=kol_affiliate&_x_vst_scene=adg&_x_campaign=affiliate&_x_sessn_id=8lsekhz6v9&refer_page_name=affiliate_account_activity&refer_page_id=10513_1730544961090_rn5idp4jaj&refer_page_sn=10513&_p_rfs=1&is_retain=1',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                    'x-document-referer': 'https://www.temu.com/afc_share_goods.html?_x_ads_csite=search&_x_ads_channel=kol_affiliate&_x_cid=kol_affiliate&_x_vst_scene=adg&_x_campaign=affiliate&_x_sessn_id=umtigkaq8z&refer_page_name=affiliate_secondary_commission&refer_page_id=18066_1731063965833_qzr9i175k1&refer_page_sn=18066&_p_rfs=1'
                    

                }
            });
            const temuProducts = temuResponse.data?.result?.result?.kp_ds_item_list || [];
            allProducts = [...partnerItems, ...temuProducts];
        } catch (temuError) {
            console.error('Temu API Error:', temuError);
        }

        // Format dữ liệu cho chatbot
        const chatbotData = formatProductsForChat(allProducts, searchKey);

        // Lưu vào session hoặc gửi đến Coze API
        if (req.session) {
            req.session.currentProductSearch = chatbotData;
        }

        res.json({
            success: true,
            error_code: 1000000,
            result: {
                result: {
                    kp_ds_item_list: allProducts
                }
            },
            chatbotData // Thêm dữ liệu chatbot vào response
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(error.response?.status || 500).json({ 
            error: 'Lỗi khi tìm kiếm', 
            details: error.message 
        });
    }
});

// API tìm kiếm Shopee
router.post('/search-shopee', async (req, res) => {
    const { searchKey } = req.body;
    const API_URL = 'https://apiv3.beecost.vn/search/keyword';

    if (!searchKey || typeof searchKey !== 'string') {
        return res.status(400).json({ error: 'searchKey không hợp lệ' });
    }

    const searchSlug = convertToSlug(searchKey);

    try {
        const response = await axios.post(API_URL, {
            slug: searchSlug,
            page: 0,
            limit: 24,
            query_search_filter_sort: { sort: "google_queries.pos__asc" }
        });

        if (response.data && response.data.status === "success") {
            const products = response.data.data.lst_product;
            const shopeeProducts = products.filter(product =>
                product.url_thumbnail.startsWith("https://cf.shopee.vn")
            );
            res.json(shopeeProducts);
        } else {
            res.status(500).json({ 
                error: "Không thể lấy dữ liệu sản phẩm.",
                details: response.data 
            });
        }
    } catch (error) {
        console.error('Shopee API Error:', error);
        res.status(error.response?.status || 500).json({ 
            error: "Lỗi khi gọi API.", 
            details: error.message 
        });
    }
});

// Thêm route mới để lấy sản phẩm gợi ý
router.get('/api/featured-products', async (req, res) => {
    const pool = req.app.locals.pool;
    
    try {
        const [products] = await pool.query(`
            SELECT 
                p.*,
                pa.name as partner_name,
                pa.website as partner_website
            FROM products p 
            LEFT JOIN partners pa ON p.partner_id = pa.id 
            WHERE p.status = true 
            ORDER BY p.priority DESC, p.created_at DESC
            LIMIT 8
        `);

        // Chuyển đổi d liệu để phù hợp với format hiển thị
        const formattedProducts = products.map(p => ({
            id: p.id,
            name: p.name,
            image_url: p.image_url && p.image_url.startsWith('http') 
                ? p.image_url 
                : `https://${p.image_url}`,
            price: Number(p.price),
            market_price: Number(p.market_price || p.price),
            sales_tip: p.sales_count ? `Đã bán ${p.sales_count}` : '',
            link: p.product_url.startsWith('http') 
                ? p.product_url 
                : `https://${p.product_url}`,
            platform: p.partner_name?.toLowerCase() || 'unknown'
        }));

        res.json(formattedProducts);
    } catch (error) {
        console.error('Error fetching featured products:', error);
        res.status(500).json({ 
            error: 'Lỗi khi lấy sản phẩm gợi ý', 
            details: error.message 
        });
    }
});

// API tìm kiếm Tiki
router.post('/search-tiki', async (req, res) => {
    const { searchKey } = req.body;
    const API_URL = 'https://apiv3.beecost.vn/search/keyword';

    if (!searchKey || typeof searchKey !== 'string') {
        return res.status(400).json({ error: 'searchKey không hợp lệ' });
    }

    const searchSlug = convertToSlug(searchKey);

    try {
        const response = await axios.post(API_URL, {
            slug: searchSlug,
            page: 0,
            limit: 24,
            query_search_filter_sort: {
                sort: "google_queries.pos__asc",
                lst_platform_id: ["3"] // ID cho Tiki
            }
        });

        if (response.data && response.data.status === "success") {
            const products = response.data.data.lst_product;
            const tikiProducts = products.filter(product => 
                product.url_thumbnail.includes("tiki")
            );
            res.json(tikiProducts);
        } else {
            res.status(500).json({ 
                error: "Không thể lấy dữ liệu sản phẩm Tiki.",
                details: response.data 
            });
        }
    } catch (error) {
        console.error('Tiki API Error:', error);
        res.status(error.response?.status || 500).json({ 
            error: "Lỗi khi gọi API Tiki.", 
            details: error.message 
        });
    }
});

module.exports = router; 