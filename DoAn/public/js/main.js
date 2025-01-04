const UI = {
    elements: {
        searchForm: document.getElementById('searchForm'),
        searchInput: document.getElementById('searchInput'),
        productsGrid: document.getElementById('productsGrid'),
        loadingSpinner: document.getElementById('loadingSpinner'),
        errorMessage: document.getElementById('errorMessage'),
        sortSelect: document.getElementById('sortSelect'),
        filterButton: document.getElementById('filterButton'),
        minPrice: document.getElementById('minPrice'),
        maxPrice: document.getElementById('maxPrice'),
        productTemplate: document.getElementById('productTemplate')
    },

    showLoading() {
        this.elements.loadingSpinner.style.display = 'block';
        this.elements.productsGrid.innerHTML = '';
        this.elements.errorMessage.style.display = 'none';
    },

    hideLoading() {
        this.elements.loadingSpinner.style.display = 'none';
    },

    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorMessage.style.display = 'block';
    },

    displayProducts(products) {
        this.elements.productsGrid.innerHTML = '';
        
        if (products.length === 0) {
            this.elements.productsGrid.innerHTML = '<div class="col-12 text-center">Không tìm thấy sản phẩm nào</div>';
            return;
        }

        products.forEach(product => {
            const template = this.elements.productTemplate.content.cloneNode(true);
            
            const image = template.querySelector('.product-image');
            image.src = product.image || '/images/no-image.png';
            image.alt = product.name;

            template.querySelector('.product-title').textContent = product.name;
            template.querySelector('.current-price').textContent = 
                Utils.formatCurrency(product.price);
            
            if (product.marketPrice > product.price) {
                template.querySelector('.original-price').textContent = 
                    Utils.formatCurrency(product.marketPrice);
                
                const discount = Utils.calculateDiscount(
                    product.marketPrice,
                    product.price
                );
                template.querySelector('.discount-badge').textContent = `-${discount}%`;
            }

            if (product.salesTip) {
                template.querySelector('.sales-info').textContent = product.salesTip;
            }

            const buyButton = template.querySelector('.buy-now-btn');
            buyButton.href = product.link;
            buyButton.target = '_blank';

            const platformBadge = template.querySelector('.platform-badge .badge');
            if (product.platform === 'shopee') {
                platformBadge.classList.add('bg-warning');
                platformBadge.innerHTML = '<i class="fas fa-shopping-bag"></i> Shopee';
            } else if (product.platform === 'Temu') {
                platformBadge.classList.add('bg-info');
                platformBadge.innerHTML = '<i class="fas fa-globe"></i> Temu';
            } else {
                platformBadge.classList.add('bg-success');
                platformBadge.innerHTML = `<i class="fas fa-store"></i> ${product.platform}`;
            }

            this.elements.productsGrid.appendChild(template);
        });
    }
};

class App {
    constructor() {
        this.products = [];
        this.currentPage = 0;
        this.loading = false;
        this.hasMore = true;
        this.itemsPerPage = 20;
        this.initializeEventListeners();
        this.loadPopularSearches();
        this.loadFeaturedProducts();
    }

    initializeEventListeners() {
        const searchForm = document.getElementById('searchForm');
        if (searchForm) {
            searchForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const searchKey = document.getElementById('searchInput').value.trim();
                if (searchKey) {
                    document.getElementById('homeContent').style.display = 'none';
                    document.getElementById('searchResults').style.display = 'block';
                    await this.handleSearch(searchKey);
                }
            });
        }

        if (UI.elements.sortSelect) {
            UI.elements.sortSelect.addEventListener('change', () => {
                this.handleSort();
            });
        }

        if (UI.elements.filterButton) {
            UI.elements.filterButton.addEventListener('click', () => {
                this.handleFilter();
            });
        }

        // Add infinite scroll
        window.addEventListener('scroll', () => {
            if (this.shouldLoadMore()) {
                this.loadMoreProducts();
            }
        });

        // Add platform filter listeners
        document.querySelectorAll('.platform-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                this.handleFilter();
            });
        });
    }

    shouldLoadMore() {
        if (this.loading || !this.hasMore) return false;

        const scrollHeight = document.documentElement.scrollHeight;
        const scrollTop = window.scrollY;
        const clientHeight = window.innerHeight;

        return scrollTop + clientHeight >= scrollHeight - 200;
    }

    async loadMoreProducts() {
        if (this.loading) return;

        this.loading = true;
        UI.showLoadingMore();

        const start = this.currentPage * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        const pageProducts = this.products.slice(start, end);

        if (pageProducts.length > 0) {
            UI.appendProducts(pageProducts);
            this.currentPage++;
            this.hasMore = end < this.products.length;
        } else {
            this.hasMore = false;
        }

        this.loading = false;
        UI.hideLoadingMore();
    }

    async handleSearch(searchKey) {
        if (!searchKey) return;

        UI.showLoading();
        try {
            const products = await API.searchProducts(searchKey);
            this.products = products.sort((a, b) => {
                if (a.sortOrder !== b.sortOrder) {
                    return a.sortOrder - b.sortOrder;
                }
                return a.price - b.price;
            });

            UI.displayProducts(this.products);
            
            const searchParams = new URLSearchParams(window.location.search);
            searchParams.set('q', searchKey);
            const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
            window.history.pushState({}, '', newUrl);
        } catch (error) {
            console.error('Search error:', error);
            UI.showError('Có lỗi xảy ra khi tìm kiếm. Vui lòng thử lại.');
        } finally {
            UI.hideLoading();
        }
    }

    handleSort() {
        const sortType = UI.elements.sortSelect.value;
        let sortedProducts;
        
        if (sortType) {
            const partnerProducts = this.products.filter(p => p.sortOrder === 1);
            const otherProducts = this.products.filter(p => p.sortOrder === 2);
            
            sortedProducts = [
                ...Utils.sortProducts(partnerProducts, sortType),
                ...Utils.sortProducts(otherProducts, sortType)
            ];
        } else {
            sortedProducts = [...this.products];
        }
        
        UI.displayProducts(sortedProducts);
    }

    handleFilter() {
        const minPrice = parseFloat(UI.elements.minPrice.value) || 0;
        const maxPrice = parseFloat(UI.elements.maxPrice.value) || Infinity;
        
        // Get selected platforms
        const selectedPlatforms = Array.from(document.querySelectorAll('.platform-checkbox:checked'))
            .map(checkbox => checkbox.value);
        
        const filteredProducts = Utils.filterProducts(this.products, {
            minPrice,
            maxPrice,
            platforms: selectedPlatforms
        });
        
        UI.displayProducts(filteredProducts);
    }


    async loadPopularSearches() {
        try {
            const popularTags = document.getElementById('popularTags');
            if (popularTags) {
                const popularSearches = [
                    { keyword: "Áo thun nam", icon: "fas fa-tshirt" },
                    { keyword: "Váy đầm", icon: "fas fa-female" },
                    { keyword: "Giày thể thao", icon: "fas fa-running" },
                    { keyword: "Túi xách nữ", icon: "fas fa-shopping-bag" },
                    { keyword: "Đồng hồ thông minh", icon: "fas fa-clock" },
                    { keyword: "Nước hoa", icon: "fas fa-spray-can" },
                    { keyword: "Mỹ phẩm", icon: "fas fa-magic" },
                ];
                
                popularTags.innerHTML = popularSearches.map((item, index) => `
                    <a href="/?q=${encodeURIComponent(item.keyword)}" 
                       class="popular-tag"
                       style="--i: ${index + 1}">
                        <i class="${item.icon}"></i>
                        <span>${item.keyword}</span>
                    </a>
                `).join('');
            }
        } catch (error) {
            console.error('Error loading popular searches:', error);
        }
    }

    async loadFeaturedProducts() {
        try {
            const featuredSection = document.querySelector('.featured-categories');
            if (!featuredSection) return;

            // Show loading state
            featuredSection.innerHTML = `
                <div class="flash-sale-header">
                    <div class="flash-sale-title">
                        <i class="fas fa-bolt"></i>
                        Flash Sale
                    </div>
                    <div class="countdown-wrap">
                        <div class="countdown-label">Kết thúc trong:</div>
                        <div class="countdown-timer">
                            <div class="countdown-box">
                                <div class="countdown-number" id="countdown-hours">00</div>
                                <div class="countdown-text">Giờ</div>
                            </div>
                            <div class="countdown-box">
                                <div class="countdown-number" id="countdown-minutes">00</div>
                                <div class="countdown-text">Phút</div>
                            </div>
                            <div class="countdown-box">
                                <div class="countdown-number" id="countdown-seconds">00</div>
                                <div class="countdown-text">Giây</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flash-sale-products">
                    <div class="text-center">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Đang tải...</span>
                        </div>
                    </div>
                </div>
            `;

            const products = await API.getFeaturedProducts();
            console.log('Received products:', products); // Để debug
            
            if (!products || products.length === 0) {
                featuredSection.innerHTML = `
                    <div class="flash-sale-header">
                        <div class="flash-sale-title">
                            <i class="fas fa-bolt"></i>
                            Flash Sale
                        </div>
                        <div class="countdown-wrap">
                            <div class="countdown-label">Kết thúc trong:</div>
                            <div class="countdown-timer">
                                <div class="countdown-box">
                                    <div class="countdown-number" id="countdown-hours">00</div>
                                    <div class="countdown-text">Giờ</div>
                                </div>
                                <div class="countdown-box">
                                    <div class="countdown-number" id="countdown-minutes">00</div>
                                    <div class="countdown-text">Phút</div>
                                </div>
                                <div class="countdown-box">
                                    <div class="countdown-number" id="countdown-seconds">00</div>
                                    <div class="countdown-text">Giây</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="text-center">Không có sản phẩm nào</div>
                `;
                return;
            }

            const productGrid = document.createElement('div');
            productGrid.className = 'row row-cols-2 row-cols-md-4 g-4 mt-2';
            
            products.forEach(product => {
                const template = UI.elements.productTemplate.content.cloneNode(true);
                
                // Xử lý hình ảnh
                const image = template.querySelector('.product-image');
                if (product.image_url) {
                    image.src = product.image_url;
                    console.log('Setting image URL:', product.image_url); // Để debug
                } else {
                    image.src = '/images/no-image.png';
                }
                image.alt = product.name;
                
                // Thêm xử lý lỗi hình ảnh
                image.onerror = function() {
                    console.log('Image load error:', this.src); // Để debug
                    this.onerror = null;
                    this.src = '/images/no-image.png';
                };

                // Các thông tin khác
                template.querySelector('.product-title').textContent = product.name;
                template.querySelector('.current-price').textContent = 
                    Utils.formatCurrency(product.price);
                
                if (product.market_price > product.price) {
                    const originalPrice = template.querySelector('.original-price');
                    originalPrice.textContent = Utils.formatCurrency(product.market_price);
                    originalPrice.style.display = 'inline';
                    
                    const discount = Utils.calculateDiscount(
                        product.market_price,
                        product.price
                    );
                    const discountBadge = template.querySelector('.discount-badge');
                    discountBadge.textContent = `-${discount}%`;
                    discountBadge.style.display = 'inline';
                }

                if (product.sales_tip) {
                    const salesInfo = template.querySelector('.sales-info');
                    salesInfo.textContent = product.sales_tip;
                    salesInfo.style.display = 'block';
                }

                const buyButton = template.querySelector('.buy-now-btn');
                buyButton.href = product.link;
                buyButton.target = '_blank';

                const platformBadge = template.querySelector('.platform-badge .badge');
                platformBadge.classList.add('bg-success');
                platformBadge.innerHTML = `<i class="fas fa-store"></i> ${product.platform}`;

                productGrid.appendChild(template);
            });

            // Thêm header Flash Sale và grid sản phẩm
            featuredSection.innerHTML = `
                <div class="flash-sale-header">
                    <div class="flash-sale-title">
                        <i class="fas fa-bolt"></i>
                        Flash Sale
                    </div>
                    <div class="countdown-wrap">
                        <div class="countdown-label">Kết thúc trong:</div>
                        <div class="countdown-timer">
                            <div class="countdown-box">
                                <div class="countdown-number" id="countdown-hours">00</div>
                                <div class="countdown-text">Giờ</div>
                            </div>
                            <div class="countdown-box">
                                <div class="countdown-number" id="countdown-minutes">00</div>
                                <div class="countdown-text">Phút</div>
                            </div>
                            <div class="countdown-box">
                                <div class="countdown-number" id="countdown-seconds">00</div>
                                <div class="countdown-text">Giây</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            featuredSection.appendChild(productGrid);

            // Khởi tạo đồng hồ đếm ngược
            initFlashSaleTimer();

        } catch (error) {
            console.error('Error loading featured products:', error);
            featuredSection.innerHTML = `
                <div class="flash-sale-header">
                    <div class="flash-sale-title">
                        <i class="fas fa-bolt"></i>
                        Flash Sale
                    </div>
                    <div class="countdown-wrap">
                        <div class="countdown-label">Kết thúc trong:</div>
                        <div class="countdown-timer">
                            <div class="countdown-box">
                                <div class="countdown-number" id="countdown-hours">00</div>
                                <div class="countdown-text">Giờ</div>
                            </div>
                            <div class="countdown-box">
                                <div class="countdown-number" id="countdown-minutes">00</div>
                                <div class="countdown-text">Phút</div>
                            </div>
                            <div class="countdown-box">
                                <div class="countdown-number" id="countdown-seconds">00</div>
                                <div class="countdown-text">Giây</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="alert alert-danger">
                    Có lỗi xảy ra khi tải sản phẩm. Vui lòng thử lại sau.
                </div>
            `;
        }
    }
}

// Hàm load banners
async function loadBanners() {
    try {
        const response = await fetch('/api/banners');
        const banners = await response.json();
        
        // Xử lý banner chính
        const mainBanners = banners.filter(banner => banner.position === 'main');
        const mainBannerWrapper = document.querySelector('.bannerSwiper .swiper-wrapper');
        mainBannerWrapper.innerHTML = mainBanners.map(banner => `
            <div class="swiper-slide">
                <a href="${banner.link || '#'}" title="${banner.title}">
                    <img src="${banner.image_url}" alt="${banner.title}">
                </a>
            </div>
        `).join('');

        // Xử lý banner phụ
        const sideBanners = banners.filter(banner => banner.position === 'side');
        const sideBannerContainer = document.querySelector('.banner-side');
        sideBannerContainer.innerHTML = sideBanners.map(banner => `
            <div class="banner-side-item">
                <a href="${banner.link || '#'}" title="${banner.title}">
                    <img src="${banner.image_url}" alt="${banner.title}">
                </a>
            </div>
        `).join('');

        // Khởi tạo Swiper với các tùy chọn nâng cao
        new Swiper('.bannerSwiper', {
            loop: true,
            speed: 1000,
            autoplay: {
                delay: 5000,
                disableOnInteraction: false,
            },
            effect: 'fade',
            fadeEffect: {
                crossFade: true
            },
            pagination: {
                el: '.swiper-pagination',
                clickable: true,
            },
            navigation: {
                nextEl: '.swiper-button-next',
                prevEl: '.swiper-button-prev',
            },
            // Lazy loading
            lazy: {
                loadPrevNext: true,
            },
            // Tối ưu hiệu suất
            preloadImages: false,
            watchSlidesProgress: true,
            watchSlidesVisibility: true,
        });

    } catch (error) {
        console.error('Error loading banners:', error);
    }
}

// Flash Sale Countdown Timer
function initFlashSaleTimer() {
    // Set end time - ví dụ: kết thúc sau 24h
    const endTime = new Date();
    endTime.setHours(endTime.getHours() + 24);

    function updateTimer() {
        const now = new Date();
        const diff = endTime - now;

        if (diff <= 0) {
            // Reset timer khi kết thúc
            endTime.setHours(endTime.getHours() + 24);
            return;
        }

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        document.getElementById('countdown-hours').textContent = hours.toString().padStart(2, '0');
        document.getElementById('countdown-minutes').textContent = minutes.toString().padStart(2, '0');
        document.getElementById('countdown-seconds').textContent = seconds.toString().padStart(2, '0');
    }

    // Update timer mỗi giây
    updateTimer();
    setInterval(updateTimer, 1000);
}

// Initialize Flash Sale Swiper
const flashSaleSwiper = new Swiper('.flashSaleSwiper', {
    slidesPerView: 1,
    spaceBetween: 20,
    navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
    },
    breakpoints: {
        640: {
            slidesPerView: 2,
        },
        768: {
            slidesPerView: 3,
        },
        1024: {
            slidesPerView: 4,
        },
    }
});

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
    initFlashSaleTimer();
});

// Đảm bảo tất cả resources đã load xong
window.addEventListener('load', () => {
    app = new App();
    
    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('q');
    if (searchQuery) {
        document.getElementById('searchInput').value = searchQuery;
        document.getElementById('homeContent').style.display = 'none';
        document.getElementById('searchResults').style.display = 'block';
        app.handleSearch(searchQuery);
    }
    
    loadBanners();
    blogManager.loadBlogs();
});