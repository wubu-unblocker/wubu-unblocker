# ... (Keep your top RUN/ENV sections the same)

WORKDIR /workspace
COPY . /workspace

RUN if [ -f /workspace/app.zip ]; then \
      echo "Zip found, extracting..." ; \
      mkdir -p /app ; \
      unzip -q /workspace/app.zip -d /app ; \
    else \
      echo "No zip found, copying files directly..." ; \
      mkdir -p /app && cp -Ra /workspace/. /app ; \
    fi

WORKDIR /app
# Remove the zip from the final app directory to save space
RUN rm -f /app/app.zip

# ... (Keep the rest of your RUN npm ci, build, and CMD sections)
