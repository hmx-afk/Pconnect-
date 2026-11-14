// ==========================================
    // PConnect - Service Details
    // ==========================================

    const params =
        new URLSearchParams(
            window.location.search
        );


    const selectedService =
        params.get("service");


    const serviceName =
        document.getElementById(
            "serviceName"
        );

    const serviceIcon =
        document.getElementById(
            "serviceIcon"
        );

    const serviceStatus =
        document.getElementById(
            "serviceStatus"
        );

    const servicePrice =
        document.getElementById(
            "servicePrice"
        );

    const serviceDescription =
        document.getElementById(
            "serviceDescription"
        );

    const serviceFeatures =
        document.getElementById(
            "serviceFeatures"
        );

    const requestArea =
        document.getElementById(
            "requestArea"
        );

    const serviceContent =
        document.getElementById(
            "serviceContent"
        );

    const errorContent =
        document.getElementById(
            "errorContent"
        );


    // ==========================================
    // SERVICES
    // ==========================================

    const services = {

        "Web Development": {

            icon: "💻",

            status: "AVAILABLE",

            price: "From 1 π",

            description:
                "Build modern websites and web applications for your business, project, or community.",

            features: [
                "🌐 Modern responsive websites",
                "📱 Mobile-friendly design",
                "⚡ Fast and clean web pages",
                "🔧 Website updates and improvements",
                "🚀 Project deployment support"
            ]

        },


        "Graphic Design": {

            icon: "🎨",

            status: "AVAILABLE",

            price: "From 0.5 π",

            description:
                "Create professional visual content for your brand, business, community, or social media.",

            features: [
                "🎨 Logo design",
                "📱 Social media graphics",
                "🖼️ Banners and promotional designs",
                "✨ Brand visual concepts",
                "📦 Digital marketing graphics"
            ]

        },


        "Content Writing": {

            icon: "✍️",

            status: "AVAILABLE",

            price: "From 0.3 π",

            description:
                "Create clear and engaging content for websites, businesses, products, and online platforms.",

            features: [
                "📝 Article and blog writing",
                "🌐 Website content",
                "📄 Copywriting",
                "📢 Promotional content",
                "✏️ Content editing and improvement"
            ]

        },


        "Digital Marketing": {

            icon: "📣",

            status: "AVAILABLE",

            price: "From 1 π",

            description:
                "Marketing support for businesses, products, communities, and online projects.",

            features: [
                "📣 Online promotion",
                "📱 Social media support",
                "📈 Growth strategies",
                "🎯 Audience targeting",
                "📊 Basic marketing guidance"
            ]

        },


        "Tech Support": {

            icon: "🔧",

            status: "AVAILABLE",

            price: "From 0.3 π",

            description:
                "Get help with websites, basic technical issues, setup, troubleshooting, and digital tools.",

            features: [
                "🔧 Technical troubleshooting",
                "⚙️ Software and tool setup",
                "💻 Website support",
                "📱 Basic device and app guidance",
                "🛠️ Digital tools assistance"
            ]

        },


        "App Development": {

            icon: "📱",

            status: "COMING SOON",

            price: "Coming Soon",

            description:
                "Mobile application development services will be available soon.",

            features: [
                "📱 Mobile application development",
                "🎨 App interface design",
                "⚙️ App functionality",
                "🚀 App deployment",
                "🔒 Basic app security"
            ]

        }

    };


    // ==========================================
    // VALIDATE SERVICE
    // ==========================================

    const service =
        services[selectedService];


    if (!service) {

        serviceContent.style.display =
            "none";

        errorContent.style.display =
            "block";

    } else {

        // ======================================
        // BASIC INFORMATION
        // ======================================

        serviceName.textContent =
            selectedService;

        serviceIcon.textContent =
            service.icon;

        serviceDescription.textContent =
            service.description;


        // ======================================
        // STATUS
        // ======================================

        serviceStatus.textContent =
            service.status;


        serviceStatus.className =
            "status " +
            (
                service.status === "AVAILABLE"
                    ? "available"
                    : "coming"
            );


        // ======================================
        // PRICE
        // ======================================

        servicePrice.textContent =
            service.price;


        // ======================================
        // FEATURES
        // ======================================

        serviceFeatures.innerHTML = "";


        service.features.forEach(
            function(feature) {

                const li =
                    document.createElement(
                        "li"
                    );

                li.textContent =
                    feature;

                serviceFeatures.appendChild(
                    li
                );

            }
        );


        // ======================================
        // REQUEST BUTTON
        // ======================================

        if (
            service.status ===
            "AVAILABLE"
        ) {

            requestArea.innerHTML = `

                <a
                    href="/request.html?service=${encodeURIComponent(selectedService)}"
                    class="request-btn"
                >
                    📩 Request This Service
                </a>

            `;

        } else {

            requestArea.innerHTML = `

                <div class="disabled-btn">
                    📱 Coming Soon
                </div>

            `;

        }

    }
