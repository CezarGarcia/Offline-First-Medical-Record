# ms-clinico — imagem de produção (jar do Spring Boot numa JRE enxuta)

FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml ./
COPY src ./src
# O cache do Maven fica guardado entre builds na mesma máquina (BuildKit)
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 1001 --no-create-home app
COPY --from=build /app/target/ms-clinico.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-Xmx384m", "-XX:+ExitOnOutOfMemoryError", "-jar", "app.jar"]
