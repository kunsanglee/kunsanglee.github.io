---
title: "Effective Java - 아이템 2: 생성자에 매개변수가 많다면 빌더를 고려하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

## 빌더패턴 이전에 사용하던 방식

### 점층적 생성자 패턴

정적 팩터리와 생성자에는 선택적 매개변수가 많을 때 적절히 대응하기 어렵다는 제약이 있다.

```java
// 점층적 생성자 패턴을 사용하는 클래스(선택적 매개변수가 많아서 생성자 또한 많다)
public class NutritionFacts {
    private final int servingSize;  // 필수
    private final int servings;     // 필수
    private final int calories;     // 선택
    private final int fat;          // 선택
    private final int sodium;       // 선택
    private final int carbohydrate; // 선택

    public NutritionFacts(int servingSize, int servings) {
        this(servingSize, servings, 0);
    }

    public NutritionFacts(int servingSize, int servings, int calories) {
        this(servingSize, servings, calories, 0);
    }

    public NutritionFacts(int servingSize, int servings, int calories, int fat) {
        this(servingSize, servings, calories, fat, 0);
    }

    public NutritionFacts(int servingSize, int servings, int calories, int fat, int sodium) {
        this(servingSize, servings, calories, fat, sodium, 0);
    }

    public NutritionFacts(int servingSize, int servings, int calories, int fat, int sodium, int carbohydrate) {
        this.servingSize = servingSize;
        this.servings = servings;
        this.calories = calories;
        this.fat = fat;
        this.sodium = sodium;
        this.carbohydrate = carbohydrate;
    }

    // NutritionFacts cocaCola = new NutritionFacts(240, 8, 100, 0, 35, 27);
    // 생성자의 매개변수로 들어가는 값이 정확히 무엇인지 헷갈리고 휴먼 에러가 발생하기 쉽다.
}
```

**위 처럼 매개변수 개수가 많아지면 클라이언트 코드를 작성하거나 읽기 어렵다.**

### 자바빈즈 패턴

>매개변수가 없는 생성자로 객체를 만든 후, setter 메서드들을 호출해 원하는 매개변수의 값을 설정하는 방식.<br>
점층적 생성자 패턴의 단점들이 자바 빈즈 패턴에서는 더 이상 보이지 않는다.
코드가 길어지긴 했지만 인스턴스를 만들기 쉽고, 더 읽기 쉬운 코드가 되었다.

```java
public class NutritionFacts {
    private final int servingSize = -1;  // 필수, 기본값 없음
    private final int servings = -1;     // 필수, 기본값 없음
    private final int calories = 0;
    private final int fat = 0;
    private final int sodium = 0;
    private final int carbohydrate = 0;

    public NutritionFacts() {
    }

    // setter 메서드들
    public void setServings(int val) {
        servingSize = val;
    }

    public void setServings(int val) {
        servings = val;
    }

    public void setCalories(int val) {
        calories = val;
    }

    public void setFat(int val) {
        fat = val;
    }

    public void setSodium(int val) {
        sodium = val;
    }

    public void setCarbohydrate(int val) {
        carbohydrate = val;
    }
}
```

>점층적 생성자 패턴은 매개변수들의 유효성을 생성자에서 확인하면 일관성을 유지할 수 있었는데, 그 장치가 사라졌다.<br>
**자바빈즈 패턴에서는 객체 하나를 만들려면 메서드를 여러 개 호출해야 하고, 객체가 완전히 생성되기 전까지는 일관성(consistency)이 무너진 상태에 놓이게 된다.**<br>
외부에서 setter 메서드로 필드의 값을 변경할 수 있기 때문에 불변 클래스로 만들 수 없다.

### 빌더 패턴

빌더 패턴은 점층적 생성자 패턴의 안전성과 자바 빈즈 패턴의 가독성을 겸비했다.
1. 필요한 객체를 직접 만드는 대신, 필수 매개변수만으로 생성자(혹은 정적 팩터리)를 호출해 빌더 객체를 얻는다.
2. 빌더 객체가 제공하는 일종의 세터 메서드들로 원하는 선택 매개변수들을 설정한다.
3. 매개변수가 없는 build 메서드를 호출해 객체를 얻는다.

```java
// NutritionFacts의 모든 필드가 private final
// 외부에서 필드 값을 변경하는 메서드가 없기 때문에 불변 클래스다.
public class NutritionFacts {
    private final int servingSize; 
    private final int servings;    
    private final int calories;    
    private final int fat;         
    private final int sodium;      
    private final int carbohydrate;
    
    // NutritionFacts 클래스 내부의 정적 클래스로 만들어둔다.
    public static class Builder {
        // 필수 매개변수
        private final int servingSize;
        private final int servings;
        
        // 선택 매개변수 - 기본값으로 초기화한다.
        private int calories = 0;
        private int fat = 0;
        private int sodium = 0;
        private int carbohydrate = 0;

        public Builder(int servingSize, int servings) {
            this.servingSize = servingSize;
            this.servings = servings;
        }
        
        // 빌더의 세터 메서드는 자기 자신을 반환하는 메서드 체이닝으로 연쇄적 호출이 가능하다.
        public Builder calories(int val) {
            calories = val;
            return this;
        }

        public Builder fat(int val) {
            fat = val;
            return this;
        }

        public Builder sodium(int val) {
            sodium = val;
            return this;
        }

        public Builder carbohydrate(int val) {
            carbohydrate = val;
            return this;
        }
        
        public NutritionFacts build() {
            return new NutritionFacts(this);
        }
    }

    private NutritionFacts(Builder builder) {
        servingSize = builder.servingSize;
        servings = builder.servings;
        calories = builder.calories;
        fat = builder.fat;
        sodium = builder.sodium;
        carbohydrate = builder.carbohydrate;
    }
}
```

>Builder의 setter 메서드는 순서가 바뀌어도 상관이 없고, 필요한 메서드만 호출해도 된다.<br>
빌더 패턴은 계층적으로 설계된 클래스와 함께 쓰기 좋다.<br>
추상 클래스는 추상 빌더, 구체 클래스는 구체 빌더를 갖게 한다.

```java
public abstract class Pizza {
    public enum Topping { HAM, MUSHROOM, ONION, PEPPER, SAUSAGE }

    final Set<Topping> toppings;

    // 재귀적 타입 한정을 이용하는 제네릭타입
    abstract static class Builder<T extends Builder<T>> {
        EnumSet<Topping> toppings = EnumSet.noneOf(Topping.class);

        public T addTopping(Topping topping) {
            toppings.add(Objects.require.nonNull(topping));
            return self();
        }
        
        abstract Pizza build();
        
        // 추상 메서드인 self를 더해 하위 클래스에서는 형변환하지 않고도 메서드 연쇄를 지원할 수 있다.
        // self 타입이 없는 자바를 위한 이 우회 방법을 시뮬레이트한 셀프 타입 관용구라 한다.
        protected abstract T self();
    }

    Pizza(Builder<?> builder) {
        toppings = builder.toppings.clone();
    }
}
```
<br>
구체 클래스로 뉴욕 피자와 칼초네 피자가 있다.<br>
뉴욕 피자는 크기를 필수 매개변수로 받고, 칼초네 피자는 소스를 필수 매개변수로 받는다.

```java
// 뉴욕 피자
public class NyPizza extends Pizza {
    public enum Size { SMALL, MEDIUM, LARGE }
    private final Size size;
    
    public static class Builder extends Pizza.Builder<Builder> {
        private final Size size;

        public Builder(Size size) {
            this.size = Object.requireNonNull(size);
        }

        // 추상클래스 Pizza를 구현한 구체 클래스를 반환한다.
        @Override public NyPizza build() {
            return new NyPizza(this);
        }
        
        @Override protected Builder self() { return this; }

        private NyPizza(Builder builder) {
            super(builder);
            size = build().size;
        }
    }
}
```

```java
// 칼초네 피자
public class Calzone extends Pizza {
    private final boolean sauceInside;
    
    public static class builder extends Pizza.Builder<Builder> {
        private boolean sauceInside = false; // 기본값
        
        public Builder sauceInside() {
            sauceInside = true;
            return this;
        }
        
        // 추상클래스 Pizza를 구현한 구체 클래스를 반환한다.
        @Override public Calzone build() {
            return new Calzone(this);
        }
        
        @Override protected Builder self() { return this; }
    }

    private Calzone(Builder builder) {
        super(builder);
        sauceInside = builder.sauceInside;
    }
}
```

>NyPizza.Builder는 NyPizza를 반환, Calzone.Builder는 Calzone를 반환.<br>
상위 클래스 Pizza의 build 메서드는 Pizza 타입을 반환하지만,<br> 
구체 클래스에서는 Pizza 클래스의 build 메서드를 오버라이딩하여 구체클래스 자신의 타입을 반환한다.<br> 
이처럼 하위 클래스의 메서드가 상위 클래스의 메서드가 정의한 반환 타입이 아닌,<br> 
그 하위 타입을 반환하는 기능을 **공변 반환 타이핑(covariant return typing)**이라 한다.<br>

```java
NyPizza pizza = new NyPizza.Builder(SMALL).addTopping(SAUSAGE).addTopping(ONION).build();
Calzone calzone = new Calzone.Builder().addTopping(HAM).sauceInside().build();
```

>생성자로는 누릴 수 없는 사소한 이점으로, 빌더를 이용하면 가변인수(varargs) 매개변수를 여러 개 사용할 수 있다.<br>
빌더 하나로 여러 객체를 순회하면서 만들 수 있고, 빌더에 넘기는 매개변수에 따라 다른 객체를 만들 수도 있다.

빌더 패턴에 장점만 있는 것은 아니다. 객체를 만들려면, 그에 앞서 빌더부터 만들어야 한다.<br>
또한 점층적 생성자 패턴보다 코드가 장황해서 매개변수가 4개 이상은 되어야 값어치를 한다.<br>

하지만 API는 시간이 지날수록 매개변수가 많아지는 경향이 있으므로, 애초에 빌더로 시작하는 편이 나을 때가 많다.

### 핵심 정리
생성자나 정적 팩터리가 처리해야 할 매개변수가 많다면 빌더 패턴을 선택하는 게 더 낫다.
