// ==========================================
    // PConnect - Service Marketplace
    // ==========================================

    const searchInput =
        document.getElementById("serviceSearch");

    const serviceCards =
        document.querySelectorAll(".service-card");

    const categoryButtons =
        document.querySelectorAll(".category-btn");

    const noResults =
        document.getElementById("noResults");

    let selectedCategory = "all";


    // ==========================================
    // FILTER SERVICES
    // ==========================================

    function filterServices() {

        const search =
            searchInput.value
                .trim()
                .toLowerCase();

        let visibleCount = 0;


        serviceCards.forEach(function(card) {

            const name =
                card.dataset.name
                    .toLowerCase();

            const category =
                card.dataset.category;


            const matchesSearch =
                name.includes(search);

            const matchesCategory =
                selectedCategory === "all" ||
                category === selectedCategory;


            if (
                matchesSearch &&
                matchesCategory
            ) {

                card.style.display = "block";

                visibleCount++;

            } else {

                card.style.display = "none";

            }

        });


        if (visibleCount === 0) {

            noResults.style.display =
                "block";

        } else {

            noResults.style.display =
                "none";

        }

    }


    // ==========================================
    // SEARCH
    // ==========================================

    searchInput.addEventListener(
        "input",
        filterServices
    );


    // ==========================================
    // CATEGORIES
    // ==========================================

    categoryButtons.forEach(function(button) {

        button.addEventListener(
            "click",
            function() {

                categoryButtons.forEach(
                    function(btn) {
                        btn.classList.remove(
                            "active"
                        );
                    }
                );

                button.classList.add(
                    "active"
                );

                selectedCategory =
                    button.dataset.category;

                filterServices();

            }
        );

    });
