class BlogManager {
    constructor() {
        this.blogGrid = document.getElementById('blogGrid');
        this.blogTemplate = document.getElementById('blogTemplate');
    }

    async loadBlogs() {
        try {
            const response = await fetch('/api/blogs');
            const blogs = await response.json();
            
            if (!this.blogGrid) return;

            blogs.forEach(blog => {
                const template = this.blogTemplate.content.cloneNode(true);
                
                // Set blog image
                const blogImage = template.querySelector('.blog-image');
                blogImage.src = blog.thumbnail_url || '/images/default-blog.jpg';
                blogImage.alt = blog.title;

                // Set category badge
                const categoryBadge = template.querySelector('.blog-category .badge');
                categoryBadge.textContent = blog.category || 'Tin tức';

                // Set meta information
                template.querySelector('.date-text').textContent = 
                    new Date(blog.created_at).toLocaleDateString('vi-VN');
                template.querySelector('.author-text').textContent = blog.author || 'Admin';

                // Set content
                template.querySelector('.blog-title').textContent = blog.title;
                template.querySelector('.blog-excerpt').textContent = 
                    blog.excerpt ? `${blog.excerpt.replace(/<[^>]*>/g, '').substring(0, 100)}...` : '';

                // Set link
                const link = template.querySelector('.stretched-link');
                link.href = `/blog/${blog.slug}`;

                this.blogGrid.appendChild(template);
            });

            // Initialize blog slider
            new Swiper('.blogSwiper', {
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
                    1024: {
                        slidesPerView: 3,
                    }
                },
                autoplay: {
                    delay: 5000,
                    disableOnInteraction: false,
                }
            });

        } catch (error) {
            console.error('Error loading blogs:', error);
            if (this.blogGrid) {
                this.blogGrid.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-danger">
                            Không thể tải tin tức. Vui lòng thử lại sau.
                        </div>
                    </div>
                `;
            }
        }
    }
}

// Export instance
const blogManager = new BlogManager();
