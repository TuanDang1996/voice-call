FROM node:14

ENV MEDIA_SERVER_HOST=kurento
ENV MEDIA_SERVER_PORT=8888
ENV APP_SERVER_HOST=kurento-examples
ENV APP_SERVER_PORT=8443
ENV TUTORIAL_NAME=hello-world

RUN apt-get update && apt-get install -y \
aufs-tools \
automake \
build-essential \
curl \
git \
python


RUN echo '{ "allow_root": true }' > /root/.bowerrc

# Bundle app source
COPY ./nodejs kurento-tutorial-node



WORKDIR kurento-tutorial-node

RUN npm install -g bower


EXPOSE ${APP_SERVER_PORT}
ENTRYPOINT cd kurento-${TUTORIAL_NAME}; npm start -- --ws_uri=ws://${MEDIA_SERVER_HOST}:${MEDIA_SERVER_PORT}/kurento --as_uri=http://localhost:${APP_SERVER_PORT}/

npm start -- --ws_uri=ws://localhost:8888/kurento --as_uri=http://localhost:8443/