/*
 * Interfaz del editor de feeds de Google Things To Do.
 * JavaScript plano, sin build: formulario dinámico para productos, opciones, precios y ubicaciones.
 */

// Variables globales

let products = [];
let currentFeed = '';
let feedsList = [];

// El feed seleccionado es una preferencia del navegador, no estado del servidor
function savedFeed() {
    try { return localStorage.getItem('ttd.currentFeed') || ''; } catch { return ''; }
}
function saveFeed(name) {
    try { localStorage.setItem('ttd.currentFeed', name); } catch { /* modo privado: no se recuerda */ }
}
function feedUrl() {
    return `/api/feeds/${encodeURIComponent(currentFeed)}`;
}
// Los textos de productos importados se pintan con innerHTML: siempre escapados
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
async function apiError(response, fallback) {
    try { return (await response.json()).error || fallback; } catch { return fallback; }
}

// Cargar feeds y productos al iniciar
document.addEventListener('DOMContentLoaded', function() {
    loadFeeds();
    
    // Cerrar modal al hacer clic fuera
    window.onclick = function(event) {
        const modal = document.getElementById('create-feed-modal');
        if (event.target === modal) {
            hideCreateFeedModal();
        }
    }
});

// Cargar lista de feeds
async function loadFeeds() {
    try {
        const response = await fetch('/api/feeds');
        const data = await response.json();
        
        feedsList = data.feeds || [];
        currentFeed = feedsList.includes(savedFeed()) ? savedFeed() : (feedsList[0] || '');
        
        // Actualizar selector de feeds
        const selector = document.getElementById('feed-selector');
        selector.innerHTML = '';
        
        feedsList.forEach(feed => {
            const option = document.createElement('option');
            option.value = feed;
            option.textContent = feed;
            if (feed === currentFeed) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
        
        // Mostrar/ocultar botón de eliminar (no permitir eliminar el feed por defecto)
        const deleteBtn = document.getElementById('delete-feed-btn');
        if (feedsList.length <= 1) {
            deleteBtn.style.display = 'none';
        } else {
            deleteBtn.style.display = 'inline-block';
        }
        
        // Cargar productos del feed actual
        await loadProducts();
    } catch (error) {
        console.error('Error al cargar feeds:', error);
        alert('Error al cargar feeds');
    }
}

// Cambiar de feed
async function changeFeed(feedName) {
    if (!feedName || feedName === currentFeed) return;
    
    currentFeed = feedName;
    
    saveFeed(feedName);
    
    await loadProducts();
    
    // Actualizar botón de eliminar
    const deleteBtn = document.getElementById('delete-feed-btn');
    if (feedsList.length <= 1) {
        deleteBtn.style.display = 'none';
    } else {
        deleteBtn.style.display = 'inline-block';
    }
}

// Cargar productos desde la API
async function loadProducts() {
    try {
        const response = await fetch(feedUrl());
        const data = await response.json();
        
        products = data.products || [];
        
        // Actualizar estadísticas
        document.getElementById('total-products').textContent = products.length;
        document.getElementById('last-update').textContent = 
            new Date(data.feed_metadata?.nonce || Date.now()).toLocaleString();
        
        // Mostrar productos
        renderProducts();
    } catch (error) {
        console.error('Error al cargar productos:', error);
        alert('Error al cargar productos');
    }
}
// Funciones de Precios
function convertDecimalToNanos(decimalStr) {
    const amount = Price.parseAmount(decimalStr);
    return amount ? Math.abs(amount.nanos) : 0;
}

// Función para extraer unidades y decimales de un precio completo
function splitPrice(priceStr) {
    if (!priceStr || !String(priceStr).trim()) return { units: 0, nanos: 0 };
    // Estricto: parseFloat() aceptaba "1.2.3" o "12abc" sin avisar y publicaba un precio erróneo
    const amount = Price.parseAmount(priceStr);
    if (!amount) throw new Error(`Importe no válido: "${priceStr}". Usa el formato 19,99`);
    return amount;
}


// Renderizar productos en la lista
function renderProducts() {
    const container = document.getElementById('products-container');
    
    if (products.length === 0) {
        container.innerHTML = '<p>No hay productos cargados. ¡Añade el primero!</p>';
        return;
    }
    
    container.innerHTML = products.map(product => `
        <div class="product-card">
            <h4>${escapeHtml(product.title?.localized_texts?.find(t => t.language_code === 'es')?.text || product.title?.localized_texts?.[0]?.text || 'Sin título')}</h4>
            <p><strong>ID:</strong> ${escapeHtml(product.id)}</p>
            <p><strong>Rating:</strong> ⭐ ${escapeHtml(product.rating?.average_value ?? 'N/A')} (${escapeHtml(product.rating?.rating_count ?? 0)} reviews)</p>
            <p><strong>Opciones:</strong> ${product.options?.length || 0}</p>
            <p><strong>Características:</strong> ${product.product_features?.length || 0}</p>
            <div class="product-actions">
                <button onclick="editProduct(this.dataset.id)" data-id="${escapeHtml(product.id)}" class="btn btn-small">
                    <i class="fas fa-edit"></i> Editar
                </button>
                <button onclick="deleteProduct(this.dataset.id)" data-id="${escapeHtml(product.id)}" class="btn btn-small" style="background: #fc8181;">
                    <i class="fas fa-trash"></i> Eliminar
                </button>
            </div>
        </div>
    `).join('');
}

// Mostrar formulario para añadir producto
function showAddProduct() {
    document.getElementById('product-form').style.display = 'block';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = `product-${Date.now().toString().slice(-6)}`;
    
    // Limpiar características y añadir una vacía
    const featuresContainer = document.getElementById('features-container');
    featuresContainer.innerHTML = '';
    addFeature();
    
    // Limpiar media y añadir una vacía
    const mediaContainer = document.getElementById('media-container');
    mediaContainer.innerHTML = '';
    addMedia();
    
    // Limpiar opciones y añadir una vacía
    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';
    addProductOption();
    
    // Limpiar ubicaciones del operador y añadir una vacía
    const operatorLocationsContainer = document.getElementById('operator-locations-container');
    operatorLocationsContainer.innerHTML = '';
    addOperatorLocation();
    
    // Resetear tipos de inventario
    document.querySelectorAll('.inventory-type').forEach(cb => {
        cb.checked = cb.value === 'INVENTORY_TYPE_OPERATOR_DIRECT';
    });
    
    window.scrollTo({ top: document.getElementById('product-form').offsetTop, behavior: 'smooth' });
}

// Ocultar formulario
function hideForm() {
    document.getElementById('product-form').style.display = 'none';
}

// Añadir campo de característica
function addFeature() {
    const container = document.getElementById('features-container');
    const featureItem = document.createElement('div');
    featureItem.className = 'feature-item';
    featureItem.innerHTML = `
        <select class="feature-type">
            <option value="TEXT_FEATURE_INCLUSION">Inclusión</option>
            <option value="TEXT_FEATURE_HIGHLIGHT">Destacado</option>
            <option value="TEXT_FEATURE_MUST_KNOW">Información Importante</option>
        </select>
        <input type="text" class="feature-text-en" placeholder="Text in English (HTML allowed)">
        <input type="text" class="feature-text-es" placeholder="Texto en Español (HTML permitido)">
        <input type="text" class="feature-text-zh" placeholder="文本（允許 HTML）">
        <button type="button" class="btn-remove" onclick="removeFeature(this)">×</button>
    `;
    container.appendChild(featureItem);
}

// Remover característica
function removeFeature(button) {
    button.parentElement.remove();
}

// Añadir media
function addMedia() {
    const container = document.getElementById('media-container');
    const mediaItem = document.createElement('div');
    mediaItem.className = 'media-item';
    mediaItem.innerHTML = `
        <input type="text" class="media-url" placeholder="URL de la imagen (http://...)">
        <select class="media-type">
            <option value="MEDIA_TYPE_PHOTO">Foto</option>
            <option value="MEDIA_TYPE_VIDEO">Video</option>
        </select>
        <input type="text" class="media-attribution" placeholder="Atribución (opcional)">
        <button type="button" class="btn-remove" onclick="removeMedia(this)">×</button>
    `;
    container.appendChild(mediaItem);
}

// Remover media
function removeMedia(button) {
    button.parentElement.remove();
}

// Añadir ubicación del operador
function addOperatorLocation() {
    const container = document.getElementById('operator-locations-container');
    const locationItem = document.createElement('div');
    locationItem.className = 'location-item';
    locationItem.innerHTML = `
        <input type="text" class="location-place-id" placeholder="ChIJ3S-JXmauEmsRUcIaWtf4MzE">
        <button type="button" class="btn-remove" onclick="removeOperatorLocation(this)">×</button>
    `;
    container.appendChild(locationItem);
}

// Remover ubicación del operador
function removeOperatorLocation(button) {
    button.parentElement.remove();
}


// Añadir opción de producto
function addProductOption() {
    const container = document.getElementById('options-container');
    const optionIndex = container.children.length;
    const optionId = `option-${Date.now().toString().slice(-6)}`;
    
    const optionItem = document.createElement('div');
    optionItem.className = 'option-item';
    optionItem.setAttribute('data-option-index', optionIndex);
    optionItem.innerHTML = `
        <div class="option-header">
            <h5>Opción de Producto #${optionIndex + 1}</h5>
            <button type="button" class="btn-remove" onclick="removeProductOption(this)">× Eliminar</button>
        </div>
        <div class="form-group">
            <label>ID de Opción:</label>
            <input type="text" class="option-id" value="${optionId}" placeholder="option-1">
        </div>
        <div class="form-group">
            <label>Título de Opción:</label>
            <div class="lang-inputs">
                <div class="lang-input">
                    <label class="lang-label">Inglés:</label>
                    <input type="text" class="option-title-en" placeholder="Option title in English">
                </div>
                <div class="lang-input">
                    <label class="lang-label">Español:</label>
                    <input type="text" class="option-title-es" placeholder="Título de opción en Español">
                </div>
                <div class="lang-input">
                    <label class="lang-label">Chino (zh-HK):</label>
                    <input type="text" class="option-title-zh" placeholder="選項標題">
                </div>
            </div>
        </div>

        <div class="form-group">
    <label>Descripción de Opción:</label>
    <div class="lang-inputs">
        <div class="lang-input">
            <label class="lang-label">Inglés:</label>
            <textarea class="option-desc-en" placeholder="Option description in English" rows="3"></textarea>
        </div>
        <div class="lang-input">
            <label class="lang-label">Español:</label>
            <textarea class="option-desc-es" placeholder="Descripción de opción en Español" rows="3"></textarea>
        </div>
        <div class="lang-input">
            <label class="lang-label">Chino (zh-HK):</label>
            <textarea class="option-desc-zh" placeholder="選項描述" rows="3"></textarea>
        </div>
    </div>
</div>

        <div class="form-group">
            <label>URL Landing Page:</label>
            <input type="text" class="option-landing-url" placeholder="https://example.com/tours/?language={lang}&currency={currency}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Duración (segundos):</label>
                <input type="number" class="option-duration" min="0" value="10800" placeholder="10800">
            </div>
        </div>
        <div class="form-section-cancellation" style="margin-top: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; width: 100%;">
            <div class="form-group">
                <label class="checkbox-label" style="color: #e53e3e; font-weight: bold; cursor: pointer;">
                    <input type="checkbox" class="option-non-refundable" onchange="toggleCancellationFields(this)"> 
                    <i class="fas fa-ban"></i> Producto NO CANCELABLE
                </label>
                <small style="display: block; color: #718096; margin-top: 5px;">Si marcas esta casilla, no aparecerá política de cancelación en el feed.</small>
            </div>
            
            <div class="form-row cancellation-fields-group">
                <div class="form-group">
                    <label>Cancelación - Horas antes:</label>
                    <input type="number" class="option-cancel-hours" min="0" value="24">
                </div>
                <div class="form-group">
                    <label>Cancelación - % Reembolso:</label>
                    <input type="number" class="option-cancel-percent" min="0" max="100" value="100">
                </div>
            </div>
        </div>
        <div class="form-group">
            <label>Categorías de Opción:</label>
            <div class="option-categories-container">
                <div class="option-category-item">
                    <input type="text" class="option-category" placeholder="sports">
                    <button type="button" class="btn-remove" onclick="removeOptionCategory(this)">×</button>
                </div>
            </div>
            <button type="button" class="btn btn-small" onclick="addOptionCategory(this)">
                <i class="fas fa-plus"></i> Añadir Categoría
            </button>
        </div>
        <div class="form-group">
            <label>Ubicaciones Relacionadas (Place IDs o Lat/Lng):</label>
            <div class="option-related-locations-container">
                <div class="related-location-item">
                    <select class="relation-type">
                        <option value="RELATION_TYPE_RELATED_NO_ADMISSION">Relacionado Sin Admisión</option>
                        <option value="RELATION_TYPE_ADMISSION_TICKET">Ticket de Admisión</option>
                        <option value="RELATION_TYPE_SUPPLEMENTARY_ADDON">Addon Complementario</option>
                    </select>
                    <select class="location-type">
                        <option value="place_id">Place ID</option>
                        <option value="lat_lng">Latitud/Longitud</option>
                    </select>
                    <input type="text" class="location-value" placeholder="ChIJ3S-JXmauEmsRUcIaWtf4MzE">
                    <input type="text" class="location-lat" placeholder="Lat (solo si Lat/Lng)" style="display:none;">
                    <input type="text" class="location-lng" placeholder="Lng (solo si Lat/Lng)" style="display:none;">
                    <button type="button" class="btn-remove" onclick="removeRelatedLocation(this)">×</button>
                </div>
            </div>
            <button type="button" class="btn btn-small" onclick="addRelatedLocation(this)">
                <i class="fas fa-plus"></i> Añadir Ubicación
            </button>
        </div>
        <div class="form-group">
            <label>Meeting Point (Punto de Encuentro - Opcional):</label>
            <div class="form-group">
                <label>Place ID:</label>
                <input type="text" class="meeting-point-place-id" placeholder="ChIJ3S-JXmauEmsRUcIaWtf4MzE">
            </div>
            <label>Descripción del Meeting Point:</label>
            <div class="lang-inputs">
                <div class="lang-input">
                    <label class="lang-label">Inglés:</label>
                    <input type="text" class="meeting-point-desc-en" placeholder="Meeting point description">
                </div>
                <div class="lang-input">
                    <label class="lang-label">Español:</label>
                    <input type="text" class="meeting-point-desc-es" placeholder="Descripción del punto de encuentro">
                </div>
                <div class="lang-input">
                    <label class="lang-label">Chino (zh-HK):</label>
                    <input type="text" class="meeting-point-desc-zh" placeholder="集合點描述">
                </div>
            </div>
        </div>
        <div class="form-group">
            <label>Opciones de Precio:</label>
            <div class="option-price-options-container">
                <div class="price-option-item" style="display: flex; gap: 10px; align-items: center; padding: 5px 0;">
                    <label style="color: #38a169; font-weight: bold; display: flex; align-items: center; gap: 4px; min-width: 80px;">
                        <input type="checkbox" class="price-is-free" onchange="toggleFreePrice(this)"> Gratis
                    </label>
                    <input type="text" class="price-option-id" placeholder="option-1-adult" style="width: 80px;">
                    <input type="text" class="price-option-title" placeholder="Adult (14+)" style="width: 120px;">
                    <input type="text" class="price-option-currency" value="EUR" style="width: 50px;">
                    <input type="number" class="price-option-units" value="20" placeholder="Unidades" style="width: 70px;">
                    <input type="text" class="price-option-nanos" placeholder="Nanos (ej: 990000000)" style="width: 110px;">
                    <input type="text" class="price-option-fee" placeholder="Fee" style="width: 50px;">
                    <input type="text" class="price-option-tax" placeholder="Tax" style="width: 50px;">
                    <button type="button" class="btn-remove" onclick="removePriceOption(this)">×</button>
                </div>
            </div>
            <button type="button" class="btn btn-small" onclick="addPriceOption(this)">
                <i class="fas fa-plus"></i> Añadir Opción de Precio
            </button>
        </div>
    `;
    container.appendChild(optionItem);
    
    // Añadir event listeners para location type
    const locationSelect = optionItem.querySelector('.location-type');
    if (locationSelect) {
        locationSelect.addEventListener('change', function() {
            const locationItem = this.closest('.related-location-item');
            const valueInput = locationItem.querySelector('.location-value');
            const latInput = locationItem.querySelector('.location-lat');
            const lngInput = locationItem.querySelector('.location-lng');
            
            if (this.value === 'lat_lng') {
                valueInput.style.display = 'none';
                latInput.style.display = 'block';
                lngInput.style.display = 'block';
            } else {
                valueInput.style.display = 'block';
                latInput.style.display = 'none';
                lngInput.style.display = 'none';
            }
        });
    }
    
    const nonRefundableCheckbox = optionItem.querySelector('.option-non-refundable');
    if (nonRefundableCheckbox) {
        toggleCancellationFields(nonRefundableCheckbox);
    }
}
// Remover opción de producto
function removeProductOption(button) {
    if (confirm('¿Estás seguro de que quieres eliminar esta opción?')) {
        button.closest('.option-item').remove();
    }
}

// Añadir categoría de opción
function addOptionCategory(button) {
    const container = button.previousElementSibling;
    const categoryItem = document.createElement('div');
    categoryItem.className = 'option-category-item';
    categoryItem.innerHTML = `
        <input type="text" class="option-category" placeholder="sports">
        <button type="button" class="btn-remove" onclick="removeOptionCategory(this)">×</button>
    `;
    container.appendChild(categoryItem);
}

// Remover categoría de opción
function removeOptionCategory(button) {
    button.parentElement.remove();
}

// Añadir ubicación relacionada
function addRelatedLocation(button) {
    const container = button.previousElementSibling;
    const locationItem = document.createElement('div');
    locationItem.className = 'related-location-item';
    locationItem.innerHTML = `
        <select class="relation-type">
            <option value="RELATION_TYPE_RELATED_NO_ADMISSION">Relacionado Sin Admisión</option>
            <option value="RELATION_TYPE_ADMISSION_TICKET">Ticket de Admisión</option>
            <option value="RELATION_TYPE_SUPPLEMENTARY_ADDON">Addon Complementario</option>
        </select>
        <select class="location-type">
            <option value="place_id">Place ID</option>
            <option value="lat_lng">Latitud/Longitud</option>
        </select>
        <input type="text" class="location-value" placeholder="ChIJ3S-JXmauEmsRUcIaWtf4MzE">
        <input type="text" class="location-lat" placeholder="Lat (solo si Lat/Lng)" style="display:none;">
        <input type="text" class="location-lng" placeholder="Lng (solo si Lat/Lng)" style="display:none;">
        <button type="button" class="btn-remove" onclick="removeRelatedLocation(this)">×</button>
    `;
    container.appendChild(locationItem);
    
    // Event listener para cambiar tipo
    const locationSelect = locationItem.querySelector('.location-type');
    locationSelect.addEventListener('change', function() {
        const valueInput = locationItem.querySelector('.location-value');
        const latInput = locationItem.querySelector('.location-lat');
        const lngInput = locationItem.querySelector('.location-lng');
        
        if (this.value === 'lat_lng') {
            valueInput.style.display = 'none';
            latInput.style.display = 'block';
            lngInput.style.display = 'block';
        } else {
            valueInput.style.display = 'block';
            latInput.style.display = 'none';
            lngInput.style.display = 'none';
        }
    });
}

// Remover ubicación relacionada
function removeRelatedLocation(button) {
    button.parentElement.remove();
}

// Añadir opción de precio
function addPriceOption(button) {
    const container = button.previousElementSibling;
    const div = document.createElement('div');
    div.className = 'price-option-item';
    div.style.cssText = "display: flex; gap: 8px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0;";
    
    div.innerHTML = `
        <label style="color: #38a169; font-weight: bold; display: flex; align-items: center; gap: 4px; min-width: 70px;">
            <input type="checkbox" class="price-is-free" onchange="toggleFreePrice(this)"> Gratis
        </label>
        <input type="text" class="price-option-id" placeholder="ID (adult)" style="width: 100px;">
        <input type="text" class="price-option-title" placeholder="Título (Adulto)" style="width: 140px;">
        <input type="text" class="price-option-currency" value="EUR" style="width: 50px;">
        <input type="number" class="price-option-units" value="20" placeholder="Unidades" style="width: 70px;">
        <input type="text" class="price-option-nanos" placeholder="Nanos (ej: 990000000)" style="width: 110px;">
        <input type="text" class="price-option-fee" placeholder="Fee" style="width: 50px;">
        <input type="text" class="price-option-tax" placeholder="Tax" style="width: 50px;">
        <button type="button" class="btn-remove" onclick="removePriceOption(this)" style="background: #fc8181; border: none; color: white; border-radius: 50%; width: 24px; height: 24px; cursor: pointer;">×</button>
    `;
    container.appendChild(div);
}
// Remover opción de precio
function removePriceOption(button) {
    button.parentElement.remove();
}

// Guardar producto
document.getElementById('productForm').addEventListener('submit', function (e) {
    e.preventDefault();
    e.stopPropagation();
    // Cualquier error al construir el producto (p. ej. un importe mal escrito) se muestra y no se guarda nada
    saveProductFromForm().catch(err => alert(err.message || 'Error al guardar el producto'));
});

async function saveProductFromForm() {
    
    // Recolectar datos del formulario - Título
    const titleTexts = [];
    const titleEn = document.getElementById('titleEn').value;
    const titleEs = document.getElementById('titleEs').value;
    const titleZh = document.getElementById('titleZh').value;
    if (titleEn) titleTexts.push({ language_code: "en", text: titleEn });
    if (titleEs) titleTexts.push({ language_code: "es", text: titleEs });
    if (titleZh) titleTexts.push({ language_code: "zh-HK", text: titleZh });
    
    // Descripción
    const descTexts = [];
    const descEn = document.getElementById('descEn').value;
    const descEs = document.getElementById('descEs').value;
    const descZh = document.getElementById('descZh').value;
    if (descEn) descTexts.push({ language_code: "en", text: descEn });
    if (descEs) descTexts.push({ language_code: "es", text: descEs });
    if (descZh) descTexts.push({ language_code: "zh-HK", text: descZh });
    
    // Brand Name
    const brandNameTexts = [];
    const brandNameEn = document.getElementById('brandNameEn').value;
    const brandNameEs = document.getElementById('brandNameEs').value;
    const brandNameZh = document.getElementById('brandNameZh').value;
    if (brandNameEn) brandNameTexts.push({ language_code: "en", text: brandNameEn });
    if (brandNameEs) brandNameTexts.push({ language_code: "es", text: brandNameEs });
    if (brandNameZh) brandNameTexts.push({ language_code: "zh-HK", text: brandNameZh });
    
    // Crear objeto productData
    const productData = {
        id: document.getElementById('productId').value,
        product_type: "TICKET",
        title: { localized_texts: titleTexts },
        description: { localized_texts: descTexts },
        rating: {
            average_value: parseFloat(document.getElementById('ratingAvg').value) || 0,
            rating_count: parseInt(document.getElementById('ratingCount').value) || 0
        },
        product_features: [],
        options: [],
        related_media: [],
        operator: {
            name: { localized_texts: [] },
            phone_number: document.getElementById('operatorPhone').value || undefined,
            locations: []
        },
        inventory_types: []
    };
    
    // Añadir brand_name si existe
    if (brandNameTexts.length > 0) {
        productData.brand_name = { localized_texts: brandNameTexts };
    }
    
    // Añadir características
    const featureItems = document.querySelectorAll('.feature-item');
    featureItems.forEach(item => {
        const type = item.querySelector('.feature-type').value;
        const textEn = item.querySelector('.feature-text-en')?.value || '';
        const textEs = item.querySelector('.feature-text-es')?.value || '';
        const textZh = item.querySelector('.feature-text-zh')?.value || '';
        
        const featureTexts = [];
        if (textEn) featureTexts.push({ language_code: "en", text: textEn });
        if (textEs) featureTexts.push({ language_code: "es", text: textEs });
        if (textZh) featureTexts.push({ language_code: "zh-HK", text: textZh });
        
        if (featureTexts.length > 0) {
            productData.product_features.push({
                feature_type: type,
                value: { localized_texts: featureTexts }
            });
        }
    });
    
    // Añadir media relacionada
    const mediaItems = document.querySelectorAll('.media-item');
    mediaItems.forEach(item => {
        const url = item.querySelector('.media-url').value;
        const type = item.querySelector('.media-type').value;
        const attribution = item.querySelector('.media-attribution').value;
        
        if (url) {
            const mediaObj = { url, type };
            if (attribution) {
                mediaObj.attribution = {
                    localized_texts: [{ language_code: "en", text: attribution }]
                };
            }
            productData.related_media.push(mediaObj);
        }
    });
    
// Añadir opciones de producto
const optionItems = document.querySelectorAll('.option-item');
optionItems.forEach(optionItem => {
    const optionId = optionItem.querySelector('.option-id').value;
    const optionTitleEn = optionItem.querySelector('.option-title-en')?.value || '';
    const optionTitleEs = optionItem.querySelector('.option-title-es')?.value || '';
    const optionTitleZh = optionItem.querySelector('.option-title-zh')?.value || '';
    
    const optionTitleTexts = [];
    if (optionTitleEn) optionTitleTexts.push({ language_code: "en", text: optionTitleEn });
    if (optionTitleEs) optionTitleTexts.push({ language_code: "es", text: optionTitleEs });
    if (optionTitleZh) optionTitleTexts.push({ language_code: "zh-HK", text: optionTitleZh });

    // Recoger descripción de opción
    const optionDescEn = optionItem.querySelector('.option-desc-en')?.value || '';
    const optionDescEs = optionItem.querySelector('.option-desc-es')?.value || '';
    const optionDescZh = optionItem.querySelector('.option-desc-zh')?.value || '';

    const optionDescTexts = [];
    if (optionDescEn) optionDescTexts.push({ language_code: "en", text: optionDescEn });
    if (optionDescEs) optionDescTexts.push({ language_code: "es", text: optionDescEs });
    if (optionDescZh) optionDescTexts.push({ language_code: "zh-HK", text: optionDescZh });
    
    const landingUrl = optionItem.querySelector('.option-landing-url').value;
    const duration = parseInt(optionItem.querySelector('.option-duration').value) || 0;
    const isNonRefundable = optionItem.querySelector('.option-non-refundable').checked;
    const cancelHours = parseInt(optionItem.querySelector('.option-cancel-hours').value) || 24;
    const cancelPercent = parseInt(optionItem.querySelector('.option-cancel-percent').value) || 100;
    
    const option = {
        id: optionId || `option-${Date.now()}`,
        title: { localized_texts: optionTitleTexts },
        // CORRECCIÓN: usar optionDescTexts en lugar de opdescTexts
        description: optionDescTexts.length > 0 ? { localized_texts: optionDescTexts } : undefined,
        landing_page: { url: landingUrl || "https://example.com/tours/?language={lang}&currency={currency}" },
        option_categories: [],
        related_locations: [],
        price_options: []
    };

    // Solo se añade si el checkbox NO está marcado
    if (!isNonRefundable) {
        option.cancellation_policy = {
            refund_conditions: [{
                min_duration_before_start_time_sec: cancelHours * 3600,
                refund_percent: cancelPercent
            }]
        };
    }
    
    if (duration > 0) {
        option.duration_sec = duration;
    }
    
    // Categorías de opción
    const categories = optionItem.querySelectorAll('.option-category');
    categories.forEach(cat => {
        if (cat.value) {
            option.option_categories.push({ label: cat.value });
        }
    });
    
    // Ubicaciones relacionadas
    const relatedLocations = optionItem.querySelectorAll('.related-location-item');
    relatedLocations.forEach(locItem => {
        const relationType = locItem.querySelector('.relation-type').value;
        const locType = locItem.querySelector('.location-type').value;
        const relation = {
            relation_type: relationType || "RELATION_TYPE_RELATED_NO_ADMISSION"
        };
        
        if (locType === 'place_id') {
            const placeId = locItem.querySelector('.location-value').value;
            if (placeId) {
                relation.location = {
                    location: { place_id: placeId }
                };
                option.related_locations.push(relation);
            }
        } else if (locType === 'lat_lng') {
            const lat = parseFloat(locItem.querySelector('.location-lat').value);
            const lng = parseFloat(locItem.querySelector('.location-lng').value);
            if (!isNaN(lat) && !isNaN(lng)) {
                relation.location = {
                    location: {
                        lat_lng: { latitude: lat, longitude: lng }
                    }
                };
                option.related_locations.push(relation);
            }
        }
    });
    
    // Meeting Point
    const meetingPlaceId = optionItem.querySelector('.meeting-point-place-id')?.value;
    const meetingDescEn = optionItem.querySelector('.meeting-point-desc-en')?.value || '';
    const meetingDescEs = optionItem.querySelector('.meeting-point-desc-es')?.value || '';
    const meetingDescZh = optionItem.querySelector('.meeting-point-desc-zh')?.value || '';
    
    if (meetingPlaceId) {
        const meetingDescTexts = [];
        if (meetingDescEn) meetingDescTexts.push({ language_code: "en", text: meetingDescEn });
        if (meetingDescEs) meetingDescTexts.push({ language_code: "es", text: meetingDescEs });
        if (meetingDescZh) meetingDescTexts.push({ language_code: "zh-HK", text: meetingDescZh });
        
        option.meeting_point = {
            location: { place_id: meetingPlaceId }
        };
        if (meetingDescTexts.length > 0) {
            option.meeting_point.description = { localized_texts: meetingDescTexts };
        }
    }
    
    // Opciones de precio
    const priceOptions = optionItem.querySelectorAll('.price-option-item');
    priceOptions.forEach(priceItem => {
        const priceId = priceItem.querySelector('.price-option-id').value.trim();
        const priceTitle = priceItem.querySelector('.price-option-title').value.trim();
        const isFree = priceItem.querySelector('.price-is-free').checked;
        
        if (priceId && priceTitle) {
            const priceOption = { id: priceId, title: priceTitle };

            if (isFree) {
                priceOption.is_free = true;
            } else {
                const currency = priceItem.querySelector('.price-option-currency').value || 'EUR';
                const unitsInput = priceItem.querySelector('.price-option-units');
                const nanosInput = priceItem.querySelector('.price-option-nanos');
                let units = parseInt(unitsInput.value) || 0;

// Si el usuario ingresa nanos directamente
let nanos = 0;

            if (nanosInput.value && nanosInput.value.trim() !== '') {
                // parseInt("99abc") devolvía 99 sin avisar
                if (!/^\d{1,9}$/.test(nanosInput.value.trim())) {
                    throw new Error(`Nanos no válidos: "${nanosInput.value}". Debe ser un entero de hasta 9 cifras (0,99 € = 990000000)`);
                }
                nanos = parseInt(nanosInput.value, 10);
            } else {
                
                const priceStr = unitsInput.value;
                if (priceStr && priceStr.trim()) {
                    const priceParts = splitPrice(priceStr);
                    units = priceParts.units;
                    nanos = priceParts.nanos;
                }
            }

if (units > 0 || nanos > 0) {
    priceOption.price = { 
        currency_code: currency, 
        units: units 
    };
    
    // Solo añadir nanos si hay decimales
    if (nanos > 0) {
        priceOption.price.nanos = nanos;
    }
    
    // Tasas e impuestos (también necesitan conversión si tienen decimales)
    const feeVal = priceItem.querySelector('.price-option-fee').value.replace(',', '.');
    const taxVal = priceItem.querySelector('.price-option-tax').value.replace(',', '.');
              if (feeVal || taxVal) {
                    priceOption.fees_and_taxes = {};
                    
                    if (feeVal) {
                        const feeParts = splitPrice(feeVal);
                        priceOption.fees_and_taxes.per_ticket_fee = { 
                            currency_code: currency, 
                            units: feeParts.units 
                        };
                        if (feeParts.nanos > 0) {
                            priceOption.fees_and_taxes.per_ticket_fee.nanos = feeParts.nanos;
                        }
                    }
                    
                    if (taxVal) {
                        const taxParts = splitPrice(taxVal);
                        priceOption.fees_and_taxes.per_ticket_tax = { 
                            currency_code: currency, 
                            units: taxParts.units 
                        };
                        if (taxParts.nanos > 0) {
                            priceOption.fees_and_taxes.per_ticket_tax.nanos = taxParts.nanos;
                        }
                    }
                }
            }
        }
        if (priceOption.is_free || priceOption.price) {
            option.price_options.push(priceOption);
        }
    }
});
    
    // Añadir la opción al array de opciones
    productData.options.push(option);
});
    
    // Operador
    const operatorNameEn = document.getElementById('operatorNameEn').value;
    const operatorNameEs = document.getElementById('operatorNameEs').value;
    const operatorNameZh = document.getElementById('operatorNameZh').value;
    const operatorNameTexts = [];
    if (operatorNameEn) operatorNameTexts.push({ language_code: "en", text: operatorNameEn });
    if (operatorNameEs) operatorNameTexts.push({ language_code: "es", text: operatorNameEs });
    if (operatorNameZh) operatorNameTexts.push({ language_code: "zh-HK", text: operatorNameZh });
    
    if (operatorNameTexts.length > 0) {
        productData.operator.name.localized_texts = operatorNameTexts;
    }
    
    // Ubicaciones del operador
    const operatorLocations = document.querySelectorAll('.location-place-id');
    operatorLocations.forEach(loc => {
        if (loc.value) {
            productData.operator.locations.push({
                location: { place_id: loc.value }
            });
        }
    });
    
    // Tipos de inventario
    const inventoryCheckboxes = document.querySelectorAll('.inventory-type:checked');
    inventoryCheckboxes.forEach(cb => {
        productData.inventory_types.push(cb.value);
    });
    
    // Si no hay tipos seleccionados, usar el por defecto
    if (productData.inventory_types.length === 0) {
        productData.inventory_types.push("INVENTORY_TYPE_OPERATOR_DIRECT");
    }
    
    // Campos fijos
    productData.confirmation_type = "CONFIRMATION_TYPE_INSTANT";
    productData.fulfillment_type = {
        mobile: true
    };
    

    try {
        // Verificar si el producto ya existe
        const existingProduct = products.find(p => p.id === productData.id);
        
        if (existingProduct) {
            // Actualizar producto existente
            const response = await fetch(`${feedUrl()}/products/${encodeURIComponent(productData.id)}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(productData)
            });
            
            if (!response.ok) throw new Error(await apiError(response, 'Error al actualizar producto'));
        } else {
            // Crear nuevo producto
            const response = await fetch(`${feedUrl()}/products`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(productData)
            });
            
            if (!response.ok) throw new Error(await apiError(response, 'Error al crear producto'));
        }
        
        alert('Producto guardado exitosamente!');
        hideForm();
        loadProducts();
        
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Error al guardar el producto');
    }
}
// Editar producto
async function editProduct(productId) {
    try {
        const response = await fetch(`${feedUrl()}/products/${encodeURIComponent(productId)}`);
        const product = await response.json();
        
        // Llenar formulario con datos del producto
        document.getElementById('productId').value = product.id;
        
        // Título multiidioma
        document.getElementById('titleEn').value = 
            product.title?.localized_texts?.find(t => t.language_code === 'en')?.text || '';
        document.getElementById('titleEs').value = 
            product.title?.localized_texts?.find(t => t.language_code === 'es')?.text || '';
        document.getElementById('titleZh').value = 
            product.title?.localized_texts?.find(t => t.language_code === 'zh-HK')?.text || '';
        
        // Descripción multiidioma
        document.getElementById('descEn').value = 
            product.description?.localized_texts?.find(t => t.language_code === 'en')?.text || '';
        document.getElementById('descEs').value = 
            product.description?.localized_texts?.find(t => t.language_code === 'es')?.text || '';
        document.getElementById('descZh').value = 
            product.description?.localized_texts?.find(t => t.language_code === 'zh-HK')?.text || '';
        
        // Brand Name
        if (product.brand_name) {
            document.getElementById('brandNameEn').value = 
                product.brand_name.localized_texts?.find(t => t.language_code === 'en')?.text || '';
            document.getElementById('brandNameEs').value = 
                product.brand_name.localized_texts?.find(t => t.language_code === 'es')?.text || '';
            document.getElementById('brandNameZh').value = 
                product.brand_name.localized_texts?.find(t => t.language_code === 'zh-HK')?.text || '';
        }
        
        // Rating
        document.getElementById('ratingAvg').value = product.rating?.average_value || 4.5;
        document.getElementById('ratingCount').value = product.rating?.rating_count || 100;
        
        // Limpiar características existentes
        const featuresContainer = document.getElementById('features-container');
        featuresContainer.innerHTML = '';
        
        // Añadir características del producto
        if (product.product_features) {
            product.product_features.forEach(feature => {
                const featureItem = document.createElement('div');
                featureItem.className = 'feature-item';
                featureItem.innerHTML = `
                    <input type="checkbox" class="price-is-free" onchange="toggleFreePrice(this)"> ¿FREE?
                    <select class="feature-type">
                        <option value="TEXT_FEATURE_INCLUSION" ${feature.feature_type === 'TEXT_FEATURE_INCLUSION' ? 'selected' : ''}>Inclusión</option>
                        <option value="TEXT_FEATURE_HIGHLIGHT" ${feature.feature_type === 'TEXT_FEATURE_HIGHLIGHT' ? 'selected' : ''}>Destacado</option>
                        <option value="TEXT_FEATURE_MUST_KNOW" ${feature.feature_type === 'TEXT_FEATURE_MUST_KNOW' ? 'selected' : ''}>Información Importante</option>
                    </select>
                    <input type="text" class="feature-text-en" value="${(feature.value?.localized_texts?.find(t => t.language_code === 'en')?.text || '').replace(/"/g, '&quot;')}">
                    <input type="text" class="feature-text-es" value="${(feature.value?.localized_texts?.find(t => t.language_code === 'es')?.text || '').replace(/"/g, '&quot;')}">
                    <input type="text" class="feature-text-zh" value="${(feature.value?.localized_texts?.find(t => t.language_code === 'zh-HK')?.text || '').replace(/"/g, '&quot;')}">
                    <button type="button" class="btn-remove" onclick="removeFeature(this)">×</button>
                `;
                featuresContainer.appendChild(featureItem);
            });
        }
        
        // Si no hay características, añadir una vacía
        if (!product.product_features || product.product_features.length === 0) {
            addFeature();
        }
        
        // Media relacionada
        const mediaContainer = document.getElementById('media-container');
        mediaContainer.innerHTML = '';
        if (product.related_media && product.related_media.length > 0) {
            product.related_media.forEach(media => {
                const mediaItem = document.createElement('div');
                mediaItem.className = 'media-item';
                const attribution = media.attribution?.localized_texts?.[0]?.text || '';
                mediaItem.innerHTML = `
                    <input type="text" class="media-url" value="${media.url || ''}">
                    <select class="media-type">
                        <option value="MEDIA_TYPE_PHOTO" ${media.type === 'MEDIA_TYPE_PHOTO' ? 'selected' : ''}>Foto</option>
                        <option value="MEDIA_TYPE_VIDEO" ${media.type === 'MEDIA_TYPE_VIDEO' ? 'selected' : ''}>Video</option>
                    </select>
                    <input type="text" class="media-attribution" value="${attribution.replace(/"/g, '&quot;')}" placeholder="Atribución (opcional)">
                    <button type="button" class="btn-remove" onclick="removeMedia(this)">×</button>
                `;
                mediaContainer.appendChild(mediaItem);
            });
        }
        if (!product.related_media || product.related_media.length === 0) {
            addMedia();
        }
        
        // Opciones de producto
        const optionsContainer = document.getElementById('options-container');
        optionsContainer.innerHTML = '';
        if (product.options && product.options.length > 0) {
            product.options.forEach((option, index) => {
                const optionItem = document.createElement('div');
                optionItem.className = 'option-item';
                optionItem.setAttribute('data-option-index', index);
                
                // Construir opciones de precio
                let priceOptionsHTML = '';
                if (option.price_options && option.price_options.length > 0) {
                    option.price_options.forEach(po => {
                        const isFree = po.is_free === true; 
                        const fee = po.fees_and_taxes?.per_ticket_fee?.units || '';
                        const tax = po.fees_and_taxes?.per_ticket_tax?.units || '';
                        
                        priceOptionsHTML += `
                            <div class="price-option-item" style="display: flex; gap: 10px; align-items: center; border-bottom: 1px solid #eee; padding: 5px 0;">
                                <label style="color: #38a169; font-weight: bold; display: flex; align-items: center; gap: 4px; min-width: 80px;">
                                    <input type="checkbox" class="price-is-free" ${isFree ? 'checked' : ''} onchange="toggleFreePrice(this)"> Gratis
                                </label>
                                <input type="text" class="price-option-id" value="${po.id || ''}" placeholder="ID" style="width: 80px;">
                                <input type="text" class="price-option-title" value="${(po.title || '').replace(/"/g, '&quot;')}" placeholder="Título" style="width: 120px;">
                                <input type="text" class="price-option-currency" value="${po.price?.currency_code || 'EUR'}" style="width: 50px; ${isFree ? 'opacity:0.3' : ''}">
                                <input type="number" class="price-option-units" value="${po.price?.units || 0}" placeholder="Unidades" style="width: 70px; ${isFree ? 'opacity:0.3' : ''}">
                                <input type="text" class="price-option-nanos" value="${po.price?.nanos || ''}" placeholder="Nanos" style="width: 110px; ${isFree ? 'opacity:0.3' : ''}">
                                <input type="text" class="price-option-fee" value="${fee}" placeholder="Fee" style="width: 50px; ${isFree ? 'opacity:0.3' : ''}">
                                <input type="text" class="price-option-tax" value="${tax}" placeholder="Tax" style="width: 50px; ${isFree ? 'opacity:0.3' : ''}">
                                <button type="button" class="btn-remove" onclick="removePriceOption(this)">×</button>
                            </div>
                        `;
                    });
                } else {
                    priceOptionsHTML = `
                        <div class="price-option-item">
                            <input type="checkbox" class="price-is-free" onchange="toggleFreePrice(this)"> ¿FREE?
                            <input type="text" class="price-option-id" placeholder="option-1-adult">
                            <input type="text" class="price-option-title" placeholder="Adult (14+)">
                            <input type="text" class="price-option-currency" placeholder="EUR" value="EUR">
                            <input type="number" class="price-option-units" placeholder="Unidades" value="20" style="width: 70px;">
                            <input type="text" class="price-option-nanos" placeholder="Nanos (ej: 990000000)" style="width: 110px;">
                            <input type="text" class="price-option-fee" placeholder="Fee (opcional)">
                            <input type="text" class="price-option-tax" placeholder="Tax (opcional)">
                            <button type="button" class="btn-remove" onclick="removePriceOption(this)">×</button>
                        </div>
                    `;
                }
                
                // Construir categorías
                let categoriesHTML = '';
                if (option.option_categories && option.option_categories.length > 0) {
                    option.option_categories.forEach(cat => {
                        categoriesHTML += `
                            <div class="option-category-item">
                                <input type="text" class="option-category" value="${(cat.label || '').replace(/"/g, '&quot;')}">
                                <button type="button" class="btn-remove" onclick="removeOptionCategory(this)">×</button>
                            </div>
                        `;
                    });
                } else {
                    categoriesHTML = `
                        <div class="option-category-item">
                            <input type="text" class="option-category" placeholder="sports">
                            <button type="button" class="btn-remove" onclick="removeOptionCategory(this)">×</button>
                        </div>
                    `;
                }
                
                // Construir ubicaciones relacionadas
                let locationsHTML = '';
                if (option.related_locations && option.related_locations.length > 0) {
                    option.related_locations.forEach(loc => {
                        const relationType = loc.relation_type || 'RELATION_TYPE_RELATED_NO_ADMISSION';
                        const location = loc.location?.location || {};
                        if (location.place_id) {
                            locationsHTML += `
                                <div class="related-location-item">
                                    <select class="relation-type">
                                        <option value="RELATION_TYPE_RELATED_NO_ADMISSION" ${relationType === 'RELATION_TYPE_RELATED_NO_ADMISSION' ? 'selected' : ''}>Relacionado Sin Admisión</option>
                                        <option value="RELATION_TYPE_ADMISSION_TICKET" ${relationType === 'RELATION_TYPE_ADMISSION_TICKET' ? 'selected' : ''}>Ticket de Admisión</option>
                                        <option value="RELATION_TYPE_SUPPLEMENTARY_ADDON" ${relationType === 'RELATION_TYPE_SUPPLEMENTARY_ADDON' ? 'selected' : ''}>Addon Complementario</option>
                                    </select>
                                    <select class="location-type">
                                        <option value="place_id" selected>Place ID</option>
                                        <option value="lat_lng">Latitud/Longitud</option>
                                    </select>
                                    <input type="text" class="location-value" value="${location.place_id}">
                                    <input type="text" class="location-lat" placeholder="Lat" style="display:none;">
                                    <input type="text" class="location-lng" placeholder="Lng" style="display:none;">
                                    <button type="button" class="btn-remove" onclick="removeRelatedLocation(this)">×</button>
                                </div>
                            `;
                        } else if (location.lat_lng) {
                            locationsHTML += `
                                <div class="related-location-item">
                                    <select class="relation-type">
                                        <option value="RELATION_TYPE_RELATED_NO_ADMISSION" ${relationType === 'RELATION_TYPE_RELATED_NO_ADMISSION' ? 'selected' : ''}>Relacionado Sin Admisión</option>
                                        <option value="RELATION_TYPE_ADMISSION_TICKET" ${relationType === 'RELATION_TYPE_ADMISSION_TICKET' ? 'selected' : ''}>Ticket de Admisión</option>
                                        <option value="RELATION_TYPE_SUPPLEMENTARY_ADDON" ${relationType === 'RELATION_TYPE_SUPPLEMENTARY_ADDON' ? 'selected' : ''}>Addon Complementario</option>
                                    </select>
                                    <select class="location-type">
                                        <option value="place_id">Place ID</option>
                                        <option value="lat_lng" selected>Latitud/Longitud</option>
                                    </select>
                                    <input type="text" class="location-value" placeholder="Place ID" style="display:none;">
                                    <input type="text" class="location-lat" value="${location.lat_lng.latitude || ''}" placeholder="Lat">
                                    <input type="text" class="location-lng" value="${location.lat_lng.longitude || ''}" placeholder="Lng">
                                    <button type="button" class="btn-remove" onclick="removeRelatedLocation(this)">×</button>
                                </div>
                            `;
                        }
                    });
                } else {
                    locationsHTML = `
                        <div class="related-location-item">
                            <select class="relation-type">
                                <option value="RELATION_TYPE_RELATED_NO_ADMISSION" selected>Relacionado Sin Admisión</option>
                                <option value="RELATION_TYPE_ADMISSION_TICKET">Ticket de Admisión</option>
                                <option value="RELATION_TYPE_SUPPLEMENTARY_ADDON">Addon Complementario</option>
                            </select>
                            <select class="location-type">
                                <option value="place_id" selected>Place ID</option>
                                <option value="lat_lng">Latitud/Longitud</option>
                            </select>
                            <input type="text" class="location-value" placeholder="ChIJ3S-JXmauEmsRUcIaWtf4MzE">
                            <input type="text" class="location-lat" placeholder="Lat" style="display:none;">
                            <input type="text" class="location-lng" placeholder="Lng" style="display:none;">
                            <button type="button" class="btn-remove" onclick="removeRelatedLocation(this)">×</button>
                        </div>
                    `;
                }
                
                const isNonRefundable = !option.cancellation_policy;
                const cancelHours = option.cancellation_policy?.refund_conditions?.[0]?.min_duration_before_start_time_sec 
                    ? Math.floor(option.cancellation_policy.refund_conditions[0].min_duration_before_start_time_sec / 3600)
                    : 24;
                const cancelPercent = option.cancellation_policy?.refund_conditions?.[0]?.refund_percent || 100;
                
                const meetingPoint = option.meeting_point || {};
                const meetingDesc = meetingPoint.description?.localized_texts || [];
                
                optionItem.innerHTML = `
                    <div class="option-header">
                        <h5>Opción de Producto #${index + 1}</h5>
                        <button type="button" class="btn-remove" onclick="removeProductOption(this)">× Eliminar</button>
                    </div>
                    <div class="form-group">
                        <label>ID de Opción:</label>
                        <input type="text" class="option-id" value="${option.id || ''}" placeholder="option-1">
                    </div>
                    <div class="form-group">
                        <label>Título de Opción:</label>
                        <div class="lang-inputs">
                            <div class="lang-input">
                                <label class="lang-label">Inglés:</label>
                                <input type="text" class="option-title-en" value="${(option.title?.localized_texts?.find(t => t.language_code === 'en')?.text || '').replace(/"/g, '&quot;')}">
                            </div>
                            <div class="lang-input">
                                <label class="lang-label">Español:</label>
                                <input type="text" class="option-title-es" value="${(option.title?.localized_texts?.find(t => t.language_code === 'es')?.text || '').replace(/"/g, '&quot;')}">
                            </div>
                            <div class="lang-input">
                                <label class="lang-label">Chino (zh-HK):</label>
                                <input type="text" class="option-title-zh" value="${(option.title?.localized_texts?.find(t => t.language_code === 'zh-HK')?.text || '').replace(/"/g, '&quot;')}">
                            </div>
                        </div>
                    </div>
                     <div class="form-group">
                                <label>Descripción de Opción:</label>
                                <div class="lang-inputs">
                                <div class="lang-input">
                                <label class="lang-label">Inglés:</label>
                                <textarea class="option-desc-en" rows="3">${(option.description?.localized_texts?.find(t => t.language_code === 'en')?.text || '').replace(/"/g, '&quot;')}</textarea>
                                </div>
                                <div class="lang-input">
                                <label class="lang-label">Español:</label>
                                <textarea class="option-desc-es" rows="3">${(option.description?.localized_texts?.find(t => t.language_code === 'es')?.text || '').replace(/"/g, '&quot;')}</textarea>
                                </div>
                                <div class="lang-input">
                                <label class="lang-label">Chino (zh-HK):</label>
                                <textarea class="option-desc-zh" rows="3">${(option.description?.localized_texts?.find(t => t.language_code === 'zh-HK')?.text || '').replace(/"/g, '&quot;')}</textarea>
                                </div>
                                </div>
                                </div>
                    <div class="form-group">
                        <label>URL Landing Page:</label>
                        <input type="text" class="option-landing-url" value="${(option.landing_page?.url || '').replace(/"/g, '&quot;')}">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Duración (segundos):</label>
                            <input type="number" class="option-duration" min="0" value="${option.duration_sec || 10800}">
                    </div>
                    <div class="form-section-cancellation" style="margin-top: 15px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; width: 100%;">
                    <div class="form-group">
                            <label class="checkbox-label" style="color: #e53e3e; font-weight: bold; cursor: pointer;">
                        <input type="checkbox" class="option-non-refundable" ${isNonRefundable ? 'checked' : ''} onchange="toggleCancellationFields(this)"> 
                         <i class="fas fa-ban"></i> Producto NO CANCELABLE
                            </label>
                    </div>

                  <div class="form-row cancellation-fields-group" style="${isNonRefundable ? 'opacity: 0.3; pointer-events: none;' : ''}">
        <div class="form-group">
            <label>Cancelación - Horas antes:</label>
            <input type="number" class="option-cancel-hours" min="0" value="${cancelHours}">
        </div>
        <div class="form-group">
            <label>Cancelación - % Reembolso:</label>
            <input type="number" class="option-cancel-percent" min="0" max="100" value="${cancelPercent}">
        </div>
    </div>
                    <div class="form-group">
                        <label>Categorías de Opción:</label>
                        <div class="option-categories-container">${categoriesHTML}</div>
                        <button type="button" class="btn btn-small" onclick="addOptionCategory(this)">
                            <i class="fas fa-plus"></i> Añadir Categoría
                        </button>
                    </div>
                    <div class="form-group">
                        <label>Ubicaciones Relacionadas (Place IDs o Lat/Lng):</label>
                        <div class="option-related-locations-container">${locationsHTML}</div>
                        <button type="button" class="btn btn-small" onclick="addRelatedLocation(this)">
                            <i class="fas fa-plus"></i> Añadir Ubicación
                        </button>
                    </div>
                    <div class="form-group">
                        <label>Meeting Point (Punto de Encuentro - Opcional):</label>
                        <div class="form-group">
                            <label>Place ID:</label>
                            <input type="text" class="meeting-point-place-id" value="${meetingPoint.location?.place_id || ''}">
                        </div>
                        <label>Descripción del Meeting Point:</label>
                        <div class="lang-inputs">
                            <div class="lang-input">
                                <label class="lang-label">Inglés:</label>
                                <input type="text" class="meeting-point-desc-en" value="${(meetingDesc.find(t => t.language_code === 'en')?.text || '').replace(/"/g, '&quot;')}">
                            </div>
                            <div class="lang-input">
                                <label class="lang-label">Español:</label>
                                <input type="text" class="meeting-point-desc-es" value="${(meetingDesc.find(t => t.language_code === 'es')?.text || '').replace(/"/g, '&quot;')}">
                            </div>
                            <div class="lang-input">
                                <label class="lang-label">Chino (zh-HK):</label>
                                <input type="text" class="meeting-point-desc-zh" value="${(meetingDesc.find(t => t.language_code === 'zh-HK')?.text || '').replace(/"/g, '&quot;')}">
                            </div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Opciones de Precio:</label>
                        <div class="option-price-options-container">${priceOptionsHTML}</div>
                        <button type="button" class="btn btn-small" onclick="addPriceOption(this)">
                            <i class="fas fa-plus"></i> Añadir Opción de Precio
                        </button>
                    </div>
                `;
                optionsContainer.appendChild(optionItem);
                
                // Añadir event listeners para location type
                optionItem.querySelectorAll('.location-type').forEach(select => {
                    select.addEventListener('change', function() {
                        const locationItem = this.closest('.related-location-item');
                        const valueInput = locationItem.querySelector('.location-value');
                        const latInput = locationItem.querySelector('.location-lat');
                        const lngInput = locationItem.querySelector('.location-lng');
                        
                        if (this.value === 'lat_lng') {
                            valueInput.style.display = 'none';
                            latInput.style.display = 'block';
                            lngInput.style.display = 'block';
                        } else {
                            valueInput.style.display = 'block';
                            latInput.style.display = 'none';
                            lngInput.style.display = 'none';
                        }
                    });
                });
                
                // AHORA SÍ: Inicializar el estado de los campos de cancelación y precios gratuitos
                // Esto debe estar aquí, después de que optionItem esté definido y añadido al DOM
                const nonRefundableCheckbox = optionItem.querySelector('.option-non-refundable');
                if (nonRefundableCheckbox) {
                    toggleCancellationFields(nonRefundableCheckbox);
                }

                // Inicializar el estado de los precios gratuitos
                optionItem.querySelectorAll('.price-is-free').forEach(checkbox => {
                    toggleFreePrice(checkbox);
                });
            });
        }
        if (!product.options || product.options.length === 0) {
            addProductOption();
        }
        
        // Operador
        if (product.operator?.name) {
            document.getElementById('operatorNameEn').value = 
                product.operator.name.localized_texts?.find(t => t.language_code === 'en')?.text || '';
            document.getElementById('operatorNameEs').value = 
                product.operator.name.localized_texts?.find(t => t.language_code === 'es')?.text || '';
            document.getElementById('operatorNameZh').value = 
                product.operator.name.localized_texts?.find(t => t.language_code === 'zh-HK')?.text || '';
        }
        
        document.getElementById('operatorPhone').value = product.operator?.phone_number || '';
        
        // Ubicaciones del operador
        const operatorLocationsContainer = document.getElementById('operator-locations-container');
        operatorLocationsContainer.innerHTML = '';
        if (product.operator?.locations && product.operator.locations.length > 0) {
            product.operator.locations.forEach(loc => {
                const locationItem = document.createElement('div');
                locationItem.className = 'location-item';
                locationItem.innerHTML = `
                    <input type="text" class="location-place-id" value="${loc.location?.place_id || ''}">
                    <button type="button" class="btn-remove" onclick="removeOperatorLocation(this)">×</button>
                `;
                operatorLocationsContainer.appendChild(locationItem);
            });
        }
        if (!product.operator?.locations || product.operator.locations.length === 0) {
            addOperatorLocation();
        }
        
        // Tipos de inventario
        const inventoryTypes = product.inventory_types || (product.inventory_type ? [product.inventory_type] : ['INVENTORY_TYPE_OPERATOR_DIRECT']);
        document.querySelectorAll('.inventory-type').forEach(cb => {
            cb.checked = inventoryTypes.includes(cb.value);
        });
        
        // Mostrar formulario
        document.getElementById('product-form').style.display = 'block';
        window.scrollTo({ top: document.getElementById('product-form').offsetTop, behavior: 'smooth' });
        
    } catch (error) {
        console.error('Error al cargar producto para editar:', error);
        alert('Error al cargar producto');
    }
}


// Eliminar producto
async function deleteProduct(productId) {
    if (!confirm('¿Estás seguro de que quieres eliminar este producto?')) {
        return;
    }
    
    try {
        const response = await fetch(`${feedUrl()}/products/${encodeURIComponent(productId)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Error al eliminar producto');
        
        alert('Producto eliminado exitosamente!');
        loadProducts();
        
    } catch (error) {
        console.error('Error:', error);
        alert('Error al eliminar el producto');
    }
}

// Descargar feed completo
async function downloadFeed() {
    try {
        let response = await fetch(`${feedUrl()}/export`);
        if (response.status === 422) {
            const report = await response.json();
            if (!confirm(formatReport(report) + '\n\nGoogle rechazará el feed. ¿Descargarlo igualmente?')) return;
            response = await fetch(`${feedUrl()}/export?force=1`);
        }
        const data = await response.json();
        
        // Crear blob y descargar
        const safeFeedName = currentFeed.replace(/[^a-zA-Z0-9_-]/g, '_');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `feed-${safeFeedName}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Error al descargar feed:', error);
        alert('Error al descargar el feed');
    }
}

function formatReport(report) {
    const lines = report.errors.slice(0, 15).map(e => `✗ ${e.path}: ${e.message}`);
    if (report.errors.length > 15) lines.push(`… y ${report.errors.length - 15} errores más`);
    const warn = report.warnings.length ? `\n${report.warnings.length} avisos` : '';
    return `${report.errors.length} errores en ${report.products} productos${warn}\n\n${lines.join('\n')}`;
}

// Validar el feed contra las reglas de Things To Do
async function validateCurrentFeed() {
    const response = await fetch(`${feedUrl()}/validate`);
    const report = await response.json();
    if (report.valid) {
        const warn = report.warnings.slice(0, 15).map(w => `• ${w.path}: ${w.message}`).join('\n');
        alert(`✓ Feed válido (${report.products} productos)` + (warn ? `\n\nAvisos:\n${warn}` : ''));
    } else {
        alert(formatReport(report));
    }
}

// Mostrar modal para crear feed
function showCreateFeedModal() {
    document.getElementById('create-feed-modal').style.display = 'block';
    document.getElementById('new-feed-name').value = '';
}

// Ocultar modal para crear feed
function hideCreateFeedModal() {
    document.getElementById('create-feed-modal').style.display = 'none';
}

// Crear nuevo feed
async function createFeed() {
    const feedName = document.getElementById('new-feed-name').value.trim();
    
    if (!feedName) {
        alert('Por favor ingresa un nombre para el feed');
        return;
    }
    
    // Validar nombre (solo letras, números, guiones y guiones bajos)
    if (!/^[a-zA-Z0-9_-]+$/.test(feedName)) {
        alert('El nombre del feed solo puede contener letras, números, guiones y guiones bajos');
        return;
    }
    
    try {
        const response = await fetch('/api/feeds', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: feedName })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al crear feed');
        }
        
        const result = await response.json();
        alert('Feed creado exitosamente!');
        hideCreateFeedModal();
        
        // Recargar lista de feeds y cambiar al nuevo feed
        await loadFeeds();
        document.getElementById('feed-selector').value = feedName;
        await changeFeed(feedName);
        
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Error al crear el feed');
    }
}

// Eliminar feed actual
async function deleteCurrentFeed() {
    if (feedsList.length <= 1) {
        alert('Debe haber al menos un feed. No se puede eliminar el único feed disponible.');
        return;
    }
    
    if (!confirm(`¿Estás seguro de que quieres eliminar el feed "${currentFeed}"? Esta acción no se puede deshacer.`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/feeds/${encodeURIComponent(currentFeed)}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al eliminar feed');
        }
        
        alert('Feed eliminado exitosamente!');
        
        saveFeed('');
        await loadFeeds();
        
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Error al eliminar el feed');
    }
}
// Función para activar/desactivar visualmente los campos de cancelación
function toggleCancellationFields(checkbox) {
    // Buscamos el contenedor de la opción
    const container = checkbox.closest('.option-item');
    if (!container) return;

    // Buscamos el grupo de campos de horas y porcentaje
    const fieldsGroup = container.querySelector('.cancellation-fields-group');
    
    if (fieldsGroup) {
        if (checkbox.checked) {
            fieldsGroup.style.opacity = '0.3';
            fieldsGroup.style.pointerEvents = 'none';
            // Establecer valores por defecto cuando está deshabilitado
            const hoursInput = fieldsGroup.querySelector('.option-cancel-hours');
            const percentInput = fieldsGroup.querySelector('.option-cancel-percent');
            if (hoursInput) hoursInput.value = '0';
            if (percentInput) percentInput.value = '0';
        } else {
            fieldsGroup.style.opacity = '1';
            fieldsGroup.style.pointerEvents = 'auto';
            // Restaurar valores por defecto cuando está habilitado
            const hoursInput = fieldsGroup.querySelector('.option-cancel-hours');
            const percentInput = fieldsGroup.querySelector('.option-cancel-percent');
            if (hoursInput && hoursInput.value === '0') hoursInput.value = '24';
            if (percentInput && percentInput.value === '0') percentInput.value = '100';
        }
    }
}

function toggleFreePrice(checkbox) {
    // Buscamos el contenedor de la fila de precio
    const row = checkbox.closest('.price-option-item');

    if (row) {
        const inputs = row.querySelectorAll('.price-option-currency, .price-option-units, .price-option-nanos, .price-option-fee, .price-option-tax');
        
        inputs.forEach(input => {
            if (checkbox.checked) {
                input.style.opacity = '0.3';
                input.style.pointerEvents = 'none';
                if(input.classList.contains('price-option-units')) input.value = "0";
                if(input.classList.contains('price-option-nanos')) input.value = "";
            } else {
                input.style.opacity = '1';
                input.style.pointerEvents = 'auto';
                if(input.classList.contains('price-option-units') && input.value === "0") input.value = "20";
            }
        });
    }
}